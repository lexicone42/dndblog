/**
 * Character sheet utility functions.
 * Extracted for testability.
 */

/**
 * Calculate ability modifier from score using D&D 5e formula.
 * @param score - Ability score (1-30)
 * @returns Modifier (-5 to +10)
 */
export function getModifier(score: number | undefined): number {
  if (score === undefined || score === null) return 0;
  return Math.floor((score - 10) / 2);
}

/**
 * Format modifier with sign for display.
 * @param mod - The modifier value
 * @returns Formatted string like "+3" or "-1"
 */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Calculate proficiency bonus from level using 5e progression.
 * @param level - Character level (1-20)
 * @returns Proficiency bonus (+2 to +6)
 */
export function getProficiencyBonus(level: number | undefined): number {
  if (!level || level < 1) return 2;
  return Math.floor((level - 1) / 4) + 2;
}

/**
 * Calculate saving throw bonus.
 * @param abilityScore - The ability score
 * @param isProficient - Whether the character is proficient
 * @param proficiencyBonus - The proficiency bonus
 * @returns Total save bonus
 */
export function getSaveBonus(
  abilityScore: number | undefined,
  isProficient: boolean,
  proficiencyBonus: number
): number {
  const mod = getModifier(abilityScore);
  return isProficient ? mod + proficiencyBonus : mod;
}

/**
 * Calculate skill bonus.
 * @param abilityScore - The governing ability score
 * @param isProficient - Whether the character is proficient
 * @param hasExpertise - Whether the character has expertise
 * @param proficiencyBonus - The proficiency bonus
 * @returns Total skill bonus
 */
export function getSkillBonus(
  abilityScore: number | undefined,
  isProficient: boolean,
  hasExpertise: boolean,
  proficiencyBonus: number
): number {
  const mod = getModifier(abilityScore);
  if (hasExpertise) return mod + proficiencyBonus * 2;
  if (isProficient) return mod + proficiencyBonus;
  return mod;
}

/**
 * Calculate total gold value from currency.
 * @param currency - Currency object with pp, gp, ep, sp, cp
 * @returns Total value in gold pieces
 */
export function getTotalGold(currency: {
  pp?: number;
  gp?: number;
  ep?: number;
  sp?: number;
  cp?: number;
} | undefined): number {
  if (!currency) return 0;
  return (
    (currency.pp ?? 0) * 10 +
    (currency.gp ?? 0) +
    (currency.ep ?? 0) * 0.5 +
    (currency.sp ?? 0) * 0.1 +
    (currency.cp ?? 0) * 0.01
  );
}

/**
 * Skill to ability mapping for D&D 5e.
 */
export const skillAbilityMap: Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'> = {
  'Acrobatics': 'dex',
  'Animal Handling': 'wis',
  'Arcana': 'int',
  'Athletics': 'str',
  'Deception': 'cha',
  'History': 'int',
  'Insight': 'wis',
  'Intimidation': 'cha',
  'Investigation': 'int',
  'Medicine': 'wis',
  'Nature': 'int',
  'Perception': 'wis',
  'Performance': 'cha',
  'Persuasion': 'cha',
  'Religion': 'int',
  'Sleight of Hand': 'dex',
  'Stealth': 'dex',
  'Survival': 'wis',
};
