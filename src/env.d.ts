interface ImportMetaEnv {
  readonly PUBLIC_BUSINESS_NAME?: string;
  readonly PUBLIC_CONTACT_EMAIL?: string;
  readonly PUBLIC_BUSINESS_ADDRESS?: string;
  readonly PUBLIC_ADSENSE_CLIENT?: string;
  readonly PUBLIC_ADSENSE_SLOT_BELOW_TOOL?: string;
  readonly PUBLIC_ADSENSE_SLOT_IN_CONTENT?: string;
  readonly PUBLIC_ADS_PORTAL_SCRIPT?: string;
  readonly PUBLIC_CF_ANALYTICS_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
