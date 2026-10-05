import { describe, expect, it } from 'vitest';
import {
  publicTopicAck,
  inPlaceBackAck,
  inPlaceTopicAck,
  unknownOnboardAck,
} from '../../patterns/onboarding_card.js';

describe('TST-ROO-247 ClassifyOnboardingAck chooses deferReply vs deferUpdate', () => {
  it('A public topic click is ephemeral deferReply', () => {
    const r = publicTopicAck();
    expect(r.ack).toBe('deferReply');
    expect(r.view).toBe('topic');
    expect(r.topic).toBe('auction');
  });

  it('An in-place topic or Back is deferUpdate', () => {
    const back = inPlaceBackAck();
    expect(back.ack).toBe('deferUpdate');
    expect(back.view).toBe('hub');
    const topic = inPlaceTopicAck();
    expect(topic.ack).toBe('deferUpdate');
    expect(topic.view).toBe('topic');
    expect(topic.topic).toBe('gvg');
  });

  it('An unknown onboard id is noop', () => {
    const r = unknownOnboardAck();
    expect(r.ack).toBe('noop');
    expect(r.view).toBe('none');
  });
});
