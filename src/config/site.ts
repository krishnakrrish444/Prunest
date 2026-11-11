// Single place for site identity and optional integrations.
// Everything optional is OFF unless a real value is supplied at build time.

const env = import.meta.env;
const clean = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

const adsenseClient = clean(env.PUBLIC_ADSENSE_CLIENT);
const googleAnalyticsId = clean(env.PUBLIC_GOOGLE_ANALYTICS_ID);

export const site = {
  name: 'Prunest',
  url: 'https://prunest.com',
  tagline: 'Measure your garden. Plan what to buy and when to plant.',
  businessName: clean(env.PUBLIC_BUSINESS_NAME),
  contactEmail: clean(env.PUBLIC_CONTACT_EMAIL),
  address: clean(env.PUBLIC_BUSINESS_ADDRESS),
  // Only a correctly shaped publisher ID turns AdSense on.
  adsenseClient: adsenseClient && /^ca-pub-\d{10,20}$/.test(adsenseClient) ? adsenseClient : undefined,
  adsenseSlots: {
    'below-tool': clean(env.PUBLIC_ADSENSE_SLOT_BELOW_TOOL),
    'in-content': clean(env.PUBLIC_ADSENSE_SLOT_IN_CONTENT),
  } as Record<AdPlacement, string | undefined>,
  adsPortalScript: (() => {
    const v = clean(env.PUBLIC_ADS_PORTAL_SCRIPT);
    return v && /^https:\/\//.test(v) ? v : undefined;
  })(),
  cfAnalyticsToken: clean(env.PUBLIC_CF_ANALYTICS_TOKEN),
  googleAnalyticsId: googleAnalyticsId && /^G-[A-Z0-9]+$/.test(googleAnalyticsId) ? googleAnalyticsId : undefined,
};

export type AdPlacement = 'below-tool' | 'in-content';

export const adsEnabled = Boolean(site.adsenseClient || site.adsPortalScript);
export const analyticsEnabled = Boolean(site.cfAnalyticsToken);

export interface ToolInfo {
  id: 'soil' | 'mulch' | 'spacing' | 'seed';
  path: string;
  name: string;
  title: string;
  description: string;
  blurb: string;
}

export const tools: ToolInfo[] = [
  {
    id: 'soil',
    path: '/raised-bed-soil-calculator',
    name: 'Raised Bed Soil Calculator',
    title: 'Raised Bed Soil Calculator — Estimate Soil Volume & Bags',
    description:
      'Work out how much soil fills one or more raised beds. Rectangular or circular, new fill or top-up, with bag counts, bulk estimate and a printable breakdown.',
    blurb: 'Soil for one or more beds, with bag sizes compared on cost, your own mix split by ingredient, and corner beds.',
  },
  {
    id: 'mulch',
    path: '/mulch-calculator',
    name: 'Mulch Calculator',
    title: 'Mulch Calculator — Calculate Coverage, Volume & Bags',
    description:
      'Add up garden areas, subtract what is already covered, and get the mulch volume for your chosen depth, with bag and bulk quantities compared side by side.',
    blurb: 'Mulch or gravel for any mix of shapes, with bags, bulk loads and by-the-ton orders compared.',
  },
  {
    id: 'spacing',
    path: '/plant-spacing-calculator',
    name: 'Plant Spacing Calculator',
    title: 'Plant Spacing Calculator — Plan Rows & Plant Positions',
    description:
      'Enter bed size and the spacing from your seed packet to see how many rows and plants fit, with a scaled top-down plan and printable measurements.',
    blurb: 'Rows, staggered rows or a square-foot grid, several crops per bed, and the seeds to buy.',
  },
  {
    id: 'seed',
    path: '/seed-starting-calculator',
    name: 'Seed Starting Calculator',
    title: 'Seed Starting Calculator — Work Back from Your Frost Date',
    description:
      'Turn “6–8 weeks before last frost” into real calendar dates. Enter your own reference date and seed packet timings to build a printable sowing schedule.',
    blurb: 'Sowing and harvest dates, repeat sowings and a timeline from your own frost dates and seed packets.',
  },
];

export const toolById = (id: ToolInfo['id']): ToolInfo => tools.find((t) => t.id === id)!;
