import { describe, expect, it } from 'vitest';
import { clientIntentsExactlyFive, intentsFixedAfterConstruction } from '../../patterns/bot_intents.js';

describe('TST-ROO-093 BotGatewayIntents are the five named intents without Presence', () => {
  it('Client construction enables exactly the five named intents', () => {
    const { present, bitValues, requiredCount } = clientIntentsExactlyFive();
    expect(present.every(Boolean)).toBe(true);
    if (bitValues) {
      expect(bitValues).toHaveLength(requiredCount);
    }
  });

  it('Presence Intent is not required', () => {
    const { presence } = clientIntentsExactlyFive();
    expect(presence).toBe(false);
  });

  it('Intents stay fixed after construction', () => {
    const { same } = intentsFixedAfterConstruction();
    expect(same).toBe(true);
  });
});
