import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * Properties for creating a monitoring dashboard.
 */
export interface MonitoringDashboardProps {
  /** Name for the dashboard */
  dashboardName: string;

  /** CloudFront distribution to monitor */
  distribution?: cloudfront.IDistribution;

  /** Lambda functions to monitor */
  lambdaFunctions?: {
    name: string;
    function: lambda.IFunction;
  }[];
}

/**
 * Creates a CloudWatch dashboard for monitoring site infrastructure.
 * Provides visibility into CloudFront CDN performance and Lambda function health.
 */
export class MonitoringDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringDashboardProps) {
    super(scope, id);

    const widgets: cloudwatch.IWidget[][] = [];

    // ==========================================================================
    // CloudFront Metrics (Row 1)
    // ==========================================================================
    if (props.distribution) {
      const distribution = props.distribution;

      // CloudFront header
      const cloudfrontHeader = new cloudwatch.TextWidget({
        markdown: '# CloudFront CDN',
        width: 24,
        height: 1,
      });

      // Request metrics
      const requestsWidget = new cloudwatch.GraphWidget({
        title: 'Requests',
        left: [
          distribution.metric('Requests', {
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 8,
        height: 6,
      });

      // Error rates
      const errorRateWidget = new cloudwatch.GraphWidget({
        title: 'Error Rates (%)',
        left: [
          distribution.metric('4xxErrorRate', {
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: '4xx Errors',
            color: '#ff9900',
          }),
          distribution.metric('5xxErrorRate', {
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: '5xx Errors',
            color: '#d13212',
          }),
        ],
        leftYAxis: {
          min: 0,
          max: 10,
          label: '%',
        },
        width: 8,
        height: 6,
      });

      // Bytes transferred
      const bytesWidget = new cloudwatch.GraphWidget({
        title: 'Bytes Transferred',
        left: [
          distribution.metric('BytesDownloaded', {
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Downloaded',
          }),
        ],
        width: 8,
        height: 6,
      });

      widgets.push([cloudfrontHeader]);
      widgets.push([requestsWidget, errorRateWidget, bytesWidget]);
    }

    // ==========================================================================
    // Lambda Metrics (Row 2+)
    // ==========================================================================
    if (props.lambdaFunctions && props.lambdaFunctions.length > 0) {
      // Lambda header
      const lambdaHeader = new cloudwatch.TextWidget({
        markdown: '# Lambda Functions',
        width: 24,
        height: 1,
      });
      widgets.push([lambdaHeader]);

      for (const { name, function: fn } of props.lambdaFunctions) {
        // Invocations
        const invocationsWidget = new cloudwatch.GraphWidget({
          title: `${name} - Invocations`,
          left: [
            fn.metricInvocations({
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          ],
          width: 6,
          height: 5,
        });

        // Errors
        const errorsWidget = new cloudwatch.GraphWidget({
          title: `${name} - Errors`,
          left: [
            fn.metricErrors({
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
              color: '#d13212',
            }),
          ],
          width: 6,
          height: 5,
        });

        // Duration
        const durationWidget = new cloudwatch.GraphWidget({
          title: `${name} - Duration (ms)`,
          left: [
            fn.metricDuration({
              statistic: 'Average',
              period: cdk.Duration.minutes(5),
              label: 'Average',
            }),
            fn.metricDuration({
              statistic: 'Maximum',
              period: cdk.Duration.minutes(5),
              label: 'Max',
              color: '#ff9900',
            }),
          ],
          width: 6,
          height: 5,
        });

        // Throttles + Concurrent Executions
        const throttlesWidget = new cloudwatch.GraphWidget({
          title: `${name} - Throttles`,
          left: [
            fn.metricThrottles({
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
              color: '#d13212',
            }),
          ],
          right: [
            fn.metric('ConcurrentExecutions', {
              statistic: 'Maximum',
              period: cdk.Duration.minutes(5),
              label: 'Concurrent',
            }),
          ],
          width: 6,
          height: 5,
        });

        widgets.push([invocationsWidget, errorsWidget, durationWidget, throttlesWidget]);
      }
    }

    // ==========================================================================
    // Alarm Status Widget (Last Row)
    // ==========================================================================
    const alarmStatusWidget = new cloudwatch.AlarmStatusWidget({
      title: 'Alarm Status',
      width: 24,
      height: 3,
      alarms: [], // CDK doesn't have a way to dynamically list all alarms, but this shows a placeholder
    });

    // Note: The AlarmStatusWidget with empty alarms array will show all alarms in the region
    // This is a workaround since CDK doesn't have a direct way to reference alarms by name pattern

    widgets.push([alarmStatusWidget]);

    // Create dashboard - widgets is a 2D array where each row is an array of widgets
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: props.dashboardName,
      widgets: widgets,
    });
  }
}
