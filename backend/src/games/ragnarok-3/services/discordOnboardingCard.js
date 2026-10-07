function webOnly() {
  throw new Error('Ragnarok 3 is web-only. Discord cards are not available.');
}

export async function deployPublicOnboardingCard() { webOnly(); }
export function onboardingDeployHttpStatus() { return 400; }

export default { deployPublicOnboardingCard, onboardingDeployHttpStatus };
