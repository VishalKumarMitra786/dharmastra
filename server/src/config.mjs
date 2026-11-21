// Reads settings from env (Worker bindings). Nothing is hard-coded except safe defaults.
const int = (v, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

export function readConfig(env) {
  return {
    pricePaise: int(env.PRO_PRICE_PAISE, 50000), // 500 INR
    currency: 'INR',
    rzpKeyId: env.RAZORPAY_KEY_ID || '',
    rzpKeySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
    webhookSecretPrevious: env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS || '',
    signingKey: env.ENTITLEMENT_SIGNING_KEY || '',
    signingKeyPrevious: env.ENTITLEMENT_SIGNING_KEY_PREVIOUS || '',
    reachSalt: env.REACH_SALT || '',
    reachEventIds: (env.REACH_EVENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    allowedOrigin: env.ALLOWED_ORIGIN || '',
    rateMax: int(env.RATE_LIMIT_MAX, 30),
    rateWindowS: int(env.RATE_LIMIT_WINDOW_S, 60),
    razorpayBase: env.RAZORPAY_API_BASE || 'https://api.razorpay.com',
  };
}
