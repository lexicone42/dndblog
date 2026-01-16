import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  /**
   * Domain name for the site (used for callback URLs)
   */
  siteDomain: string;

  /**
   * Subdomain prefix for Cognito hosted UI
   * Will create: {prefix}.auth.{region}.amazoncognito.com
   * @default 'chronicles-auth'
   */
  cognitoDomainPrefix?: string;

  /**
   * Initial users to create (email addresses)
   * These users will receive invite emails from Cognito
   */
  initialUsers?: Array<{
    email: string;
    group: 'dm' | 'player';
    /** Optional: character slug this player owns */
    characterSlug?: string;
  }>;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly cognitoDomain: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const domainPrefix = props.cognitoDomainPrefix || 'chronicles-auth';

    // The Relying Party ID for passkeys must match where authentication happens.
    // Since we use the Cognito prefix domain (not a custom domain), the RP ID
    // must be the full Cognito domain FQDN.
    const cognitoAuthDomain = `${domainPrefix}.auth.${this.region}.amazoncognito.com`;

    // =========================================================================
    // Cognito User Pool with Managed Login + Passkeys
    // =========================================================================
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'dndblog-players',

      // Sign-in configuration
      signInAliases: {
        email: true,
        username: false,
      },

      // Passkey configuration (WebAuthn/FIDO2)
      // Allows passwordless login with passkeys + traditional password as fallback
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
          passkey: true,
          emailOtp: true, // Email code as fallback
        },
      },

      // Relying Party ID for passkeys must match the authentication domain.
      // For prefix domains (not custom domains), this must be the Cognito domain.
      passkeyRelyingPartyId: cognitoAuthDomain,

      // Require user verification (biometric/PIN) for passkey auth
      passkeyUserVerification: cognito.PasskeyUserVerification.PREFERRED,

      // Self-registration disabled - admin creates users
      selfSignUpEnabled: false,

      // Account recovery via email
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // Email verification
      autoVerify: {
        email: true,
      },

      // Password policy (for password fallback)
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },

      // Standard attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },

      // Custom attributes for character ownership
      customAttributes: {
        characterSlug: new cognito.StringAttribute({
          mutable: true,
          maxLen: 64,
        }),
      },

      // Email configuration (use Cognito default for now)
      email: cognito.UserPoolEmail.withCognito(),

      // Deletion protection for production
      deletionProtection: false, // Set to true for production

      // Remove users when stack is deleted (for development)
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================================
    // User Pool Domain (Managed Login)
    // =========================================================================
    // ManagedLoginVersion.NEWER_MANAGED_LOGIN enables the new UI with passkey support
    // The classic hosted UI (version 1) doesn't support passkeys properly
    const domain = this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: domainPrefix,
      },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    this.cognitoDomain = cognitoAuthDomain;

    // =========================================================================
    // User Pool Client (for SPA)
    // =========================================================================
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'dndblog-web',
      
      // No client secret for SPA
      generateSecret: false,
      
      // OAuth configuration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `https://${props.siteDomain}/auth/callback`,
          'http://localhost:4321/auth/callback', // Local dev
        ],
        logoutUrls: [
          `https://${props.siteDomain}`,
          `https://${props.siteDomain}/campaign`,
          'http://localhost:4321',
          'http://localhost:4321/campaign',
        ],
      },
      
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // Prevent user existence errors (security)
      preventUserExistenceErrors: true,
      
      // Auth flows - USER_AUTH required for passkeys/managed login
      authFlows: {
        userSrp: true,
        user: true, // Choice-based auth (USER_AUTH) for passkeys
      },
    });

    // =========================================================================
    // Managed Login Branding (enables new UI with passkey support)
    // =========================================================================
    // Managed Login is required for passkeys to work in the hosted UI.
    // Without this, users see the classic hosted UI which doesn't support passkeys.
    new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true, // Use default Cognito branding
    });

    // =========================================================================
    // User Pool Groups
    // =========================================================================
    const dmGroup = new cognito.CfnUserPoolGroup(this, 'DmGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'dm',
      description: 'Dungeon Masters with full access',
      precedence: 1,
    });

    const playerGroup = new cognito.CfnUserPoolGroup(this, 'PlayerGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'player',
      description: 'Players with character access',
      precedence: 10,
    });

    // =========================================================================
    // Initial Users (via Custom Resource)
    // =========================================================================
    if (props.initialUsers && props.initialUsers.length > 0) {
      for (const user of props.initialUsers) {
        // Create user via CfnUserPoolUser
        const cfnUser = new cognito.CfnUserPoolUser(this, `User-${user.email.replace(/[^a-zA-Z0-9]/g, '')}`, {
          userPoolId: this.userPool.userPoolId,
          username: user.email,
          userAttributes: [
            { name: 'email', value: user.email },
            { name: 'email_verified', value: 'true' },
            ...(user.characterSlug ? [{ name: 'custom:characterSlug', value: user.characterSlug }] : []),
          ],
          desiredDeliveryMediums: ['EMAIL'],
        });

        // Add user to group
        const groupAttachment = new cognito.CfnUserPoolUserToGroupAttachment(
          this,
          `UserGroup-${user.email.replace(/[^a-zA-Z0-9]/g, '')}`,
          {
            userPoolId: this.userPool.userPoolId,
            groupName: user.group,
            username: user.email,
          }
        );

        // Ensure user is created before adding to group
        groupAttachment.addDependency(cfnUser);
        groupAttachment.addDependency(user.group === 'dm' ? dmGroup : playerGroup);
      }
    }

    // =========================================================================
    // SSM Parameters (for site build)
    // =========================================================================
    new ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: '/dndblog/cognito/user-pool-id',
      stringValue: this.userPool.userPoolId,
      description: 'Cognito User Pool ID for D&D Blog',
    });

    new ssm.StringParameter(this, 'ClientIdParam', {
      parameterName: '/dndblog/cognito/client-id',
      stringValue: this.userPoolClient.userPoolClientId,
      description: 'Cognito Client ID for D&D Blog',
    });

    new ssm.StringParameter(this, 'DomainParam', {
      parameterName: '/dndblog/cognito/domain',
      stringValue: this.cognitoDomain,
      description: 'Cognito Domain for D&D Blog',
    });

    // =========================================================================
    // Stack Outputs
    // =========================================================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'CognitoUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'CognitoClientId',
    });

    new cdk.CfnOutput(this, 'CognitoDomainOutput', {
      value: this.cognitoDomain,
      description: 'Cognito Hosted UI Domain',
      exportName: 'CognitoDomain',
    });

    new cdk.CfnOutput(this, 'HostedUIUrl', {
      value: `https://${this.cognitoDomain}/login?client_id=${this.userPoolClient.userPoolClientId}&response_type=code&scope=openid+email&redirect_uri=https://${props.siteDomain}/auth/callback`,
      description: 'Cognito Hosted UI Login URL',
    });
  }
}
