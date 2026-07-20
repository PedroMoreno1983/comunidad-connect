import type { ProductCapabilities } from '@/lib/types';

type Environment = Record<string, string | undefined>;

function hasValue(environment: Environment, name: string): boolean {
  const value = environment[name]?.trim();
  if (!value) return false;
  return !/^(TU_|your_|placeholder|changeme|xxx)/i.test(value);
}

function hasHiggsfieldCredentials(environment: Environment): boolean {
  if (hasValue(environment, 'HF_CREDENTIALS') || hasValue(environment, 'HIGGSFIELD_CREDENTIALS')) {
    return true;
  }

  const hasKey = [
    'HF_API_KEY_ID',
    'HF_KEY_ID',
    'HF_API_KEY',
    'HIGGSFIELD_API_KEY_ID',
    'HIGGSFIELD_KEY_ID',
    'HIGGSFIELD_API_KEY',
  ].some(name => hasValue(environment, name));
  const hasSecret = [
    'HF_API_KEY_SECRET',
    'HF_KEY_SECRET',
    'HF_API_SECRET',
    'HIGGSFIELD_API_KEY_SECRET',
    'HIGGSFIELD_KEY_SECRET',
    'HIGGSFIELD_API_SECRET',
  ].some(name => hasValue(environment, name));

  return hasKey && hasSecret;
}

export function resolveProductCapabilities(environment: Environment): ProductCapabilities {
  const higgsfieldReady = hasHiggsfieldCredentials(environment);
  const heygenReady = hasValue(environment, 'HEYGEN_API_KEY');
  const creatomateReady = hasValue(environment, 'CREATOMATE_API_KEY')
    && (environment.CREATOMATE_USE_TEMPLATE !== 'true' || hasValue(environment, 'CREATOMATE_TEMPLATE_ID'));
  const rendererReady = higgsfieldReady
    || heygenReady
    || creatomateReady
    || hasValue(environment, 'MARKETING_VIDEO_RENDER_WEBHOOK_URL');
  const professionalAudioReady = heygenReady
    || (higgsfieldReady && hasValue(environment, 'OPENAI_API_KEY') && creatomateReady)
    || hasValue(environment, 'CREATOMATE_MUSIC_URL')
    || hasValue(environment, 'CREATOMATE_VOICE_PROVIDER');
  const instagramReady = (
    hasValue(environment, 'INSTAGRAM_ACCESS_TOKEN')
    && hasValue(environment, 'INSTAGRAM_USER_ID')
  ) || (
    hasValue(environment, 'META_APP_ID')
    && hasValue(environment, 'META_APP_SECRET')
  );

  return {
    onlinePayments: hasValue(environment, 'HAULMER_ACCOUNT_ID')
      && hasValue(environment, 'HAULMER_SECRET_KEY'),
    marketingReels: hasValue(environment, 'ANTHROPIC_API_KEY')
      && rendererReady
      && professionalAudioReady
      && instagramReady
      && hasValue(environment, 'CRON_SECRET'),
    iotAutomation: true,
    externalMonitoring: hasValue(environment, 'AI_HEALTH_TOKEN'),
    // The current supermarket module has no real retailer or fulfilment integration.
    supermarketOrdering: false,
  };
}

export function getProductCapabilities(): ProductCapabilities {
  return resolveProductCapabilities(process.env);
}
