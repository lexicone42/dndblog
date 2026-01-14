import { describe, it, expect } from 'vitest';
import {
  getModifier,
  formatModifier,
  getProficiencyBonus,
  getSaveBonus,
  getSkillBonus,
  getTotalGold,
  skillAbilityMap,
} from './utils';

describe('getModifier', () => {
  it('returns 0 for score of 10 or 11', () => {
    expect(getModifier(10)).toBe(0);
    expect(getModifier(11)).toBe(0);
  });

  it('returns correct modifiers for standard scores', () => {
    expect(getModifier(8)).toBe(-1);
    expect(getModifier(12)).toBe(1);
    expect(getModifier(14)).toBe(2);
    expect(getModifier(18)).toBe(4);
    expect(getModifier(20)).toBe(5);
  });

  it('handles edge cases', () => {
    expect(getModifier(1)).toBe(-5); // Minimum score
    expect(getModifier(30)).toBe(10); // Maximum score
  });

  it('returns 0 for undefined', () => {
    expect(getModifier(undefined)).toBe(0);
  });
});

describe('formatModifier', () => {
  it('adds + sign to positive numbers', () => {
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(0)).toBe('+0');
  });

  it('keeps - sign on negative numbers', () => {
    expect(formatModifier(-2)).toBe('-2');
  });
});

describe('getProficiencyBonus', () => {
  it('returns +2 for levels 1-4', () => {
    expect(getProficiencyBonus(1)).toBe(2);
    expect(getProficiencyBonus(4)).toBe(2);
  });

  it('returns +3 for levels 5-8', () => {
    expect(getProficiencyBonus(5)).toBe(3);
    expect(getProficiencyBonus(8)).toBe(3);
  });

  it('returns +4 for levels 9-12', () => {
    expect(getProficiencyBonus(9)).toBe(4);
    expect(getProficiencyBonus(12)).toBe(4);
  });

  it('returns +5 for levels 13-16', () => {
    expect(getProficiencyBonus(13)).toBe(5);
    expect(getProficiencyBonus(16)).toBe(5);
  });

  it('returns +6 for levels 17-20', () => {
    expect(getProficiencyBonus(17)).toBe(6);
    expect(getProficiencyBonus(20)).toBe(6);
  });

  it('returns +2 for undefined or invalid levels', () => {
    expect(getProficiencyBonus(undefined)).toBe(2);
    expect(getProficiencyBonus(0)).toBe(2);
  });
});

describe('getSaveBonus', () => {
  it('returns just modifier when not proficient', () => {
    expect(getSaveBonus(14, false, 2)).toBe(2); // +2 DEX mod
    expect(getSaveBonus(8, false, 3)).toBe(-1); // -1 STR mod
  });

  it('adds proficiency bonus when proficient', () => {
    expect(getSaveBonus(14, true, 2)).toBe(4); // +2 DEX + 2 prof
    expect(getSaveBonus(18, true, 3)).toBe(7); // +4 INT + 3 prof
  });

  it('handles undefined ability score', () => {
    expect(getSaveBonus(undefined, true, 2)).toBe(2); // 0 + 2 prof
  });
});

describe('getSkillBonus', () => {
  it('returns just modifier when not proficient', () => {
    expect(getSkillBonus(14, false, false, 2)).toBe(2);
  });

  it('adds proficiency when proficient', () => {
    expect(getSkillBonus(14, true, false, 3)).toBe(5); // +2 + 3
  });

  it('doubles proficiency for expertise', () => {
    expect(getSkillBonus(14, true, true, 3)).toBe(8); // +2 + 6
    expect(getSkillBonus(18, true, true, 3)).toBe(10); // +4 + 6
  });
});

describe('getTotalGold', () => {
  it('calculates correct total for mixed currency', () => {
    const currency = { pp: 1, gp: 10, sp: 5, cp: 10 };
    // 1*10 + 10 + 0.5 + 0.1 = 20.6
    expect(getTotalGold(currency)).toBeCloseTo(20.6);
  });

  it('handles electrum pieces', () => {
    const currency = { ep: 10 };
    expect(getTotalGold(currency)).toBe(5);
  });

  it('returns 0 for undefined', () => {
    expect(getTotalGold(undefined)).toBe(0);
  });

  it('handles partial currency objects', () => {
    expect(getTotalGold({ gp: 50 })).toBe(50);
    expect(getTotalGold({ pp: 5 })).toBe(50);
  });
});

describe('skillAbilityMap', () => {
  it('maps all 18 skills', () => {
    expect(Object.keys(skillAbilityMap)).toHaveLength(18);
  });

  it('maps skills to correct abilities', () => {
    expect(skillAbilityMap['Athletics']).toBe('str');
    expect(skillAbilityMap['Acrobatics']).toBe('dex');
    expect(skillAbilityMap['Arcana']).toBe('int');
    expect(skillAbilityMap['Perception']).toBe('wis');
    expect(skillAbilityMap['Persuasion']).toBe('cha');
  });
});
