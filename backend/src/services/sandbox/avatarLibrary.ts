/**
 * Avatar catalogue — premium, diverse, non-identifiable profile options.
 * URLs use DiceBear Notionists / Personas styles with stable seeds (CDN).
 */

export type AvatarStyle = 'illustrated' | 'modern-flat' | 'realistic';
export type AvatarCollection = 'professional' | 'friendly' | 'casual' | 'illustrated' | 'modern-flat';
export type AvatarGender = 'male' | 'female' | 'neutral';

export type AvatarDefinition = {
  id: string;
  label: string;
  collection: AvatarCollection;
  style: AvatarStyle;
  gender: AvatarGender;
  ageGroup: 'young-adult' | 'adult' | 'mature';
  professionHint?: string;
  skinTone: string;
  url: string;
};

function dicebear(style: string, seed: string, extras = ''): string {
  const params = new URLSearchParams({ seed, backgroundColor: 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf' });
  return `https://api.dicebear.com/9.x/${style}/svg?${params.toString()}${extras}`;
}

/** Expanded premium avatar library (stable ids — safe to store on profiles). */
export const AVATAR_LIBRARY: AvatarDefinition[] = [
  // Professional
  { id: 'avatar-uganda-pro-01', label: 'Amara · Professional', collection: 'professional', style: 'modern-flat', gender: 'female', ageGroup: 'adult', professionHint: 'customer', skinTone: 'deep', url: dicebear('notionists', 'amara-pro-kampala') },
  { id: 'avatar-uganda-pro-02', label: 'Daniel · Professional', collection: 'professional', style: 'modern-flat', gender: 'male', ageGroup: 'adult', professionHint: 'electrician', skinTone: 'deep', url: dicebear('notionists', 'daniel-pro-entebbe') },
  { id: 'avatar-uganda-pro-03', label: 'Grace · Professional', collection: 'professional', style: 'modern-flat', gender: 'female', ageGroup: 'mature', professionHint: 'manager', skinTone: 'medium', url: dicebear('notionists', 'grace-pro-jinja') },
  { id: 'avatar-uganda-pro-04', label: 'Okello · Professional', collection: 'professional', style: 'modern-flat', gender: 'male', ageGroup: 'mature', professionHint: 'plumber', skinTone: 'deep', url: dicebear('notionists', 'okello-pro-gulu') },
  { id: 'avatar-uganda-pro-05', label: 'Aisha · Professional', collection: 'professional', style: 'modern-flat', gender: 'female', ageGroup: 'young-adult', professionHint: 'designer', skinTone: 'medium', url: dicebear('notionists', 'aisha-pro-mbarara') },
  { id: 'avatar-uganda-pro-06', label: 'Brian · Professional', collection: 'professional', style: 'modern-flat', gender: 'male', ageGroup: 'young-adult', professionHint: 'solar', skinTone: 'deep', url: dicebear('notionists', 'brian-pro-kampala') },
  // Friendly
  { id: 'avatar-friendly-01', label: 'Sarah · Friendly', collection: 'friendly', style: 'illustrated', gender: 'female', ageGroup: 'adult', skinTone: 'deep', url: dicebear('personas', 'sarah-n-kampala') },
  { id: 'avatar-friendly-02', label: 'David · Friendly', collection: 'friendly', style: 'illustrated', gender: 'male', ageGroup: 'adult', skinTone: 'deep', url: dicebear('personas', 'david-k-nakawa') },
  { id: 'avatar-friendly-03', label: 'Grace · Friendly', collection: 'friendly', style: 'illustrated', gender: 'female', ageGroup: 'young-adult', skinTone: 'medium', url: dicebear('personas', 'grace-a-entebbe') },
  { id: 'avatar-friendly-04', label: 'James · Friendly', collection: 'friendly', style: 'illustrated', gender: 'male', ageGroup: 'mature', skinTone: 'deep', url: dicebear('personas', 'james-m-jinja') },
  { id: 'avatar-friendly-05', label: 'Nakato · Friendly', collection: 'friendly', style: 'illustrated', gender: 'female', ageGroup: 'adult', skinTone: 'deep', url: dicebear('personas', 'nakato-friendly') },
  { id: 'avatar-friendly-06', label: 'Musa · Friendly', collection: 'friendly', style: 'illustrated', gender: 'male', ageGroup: 'young-adult', skinTone: 'medium', url: dicebear('personas', 'musa-friendly') },
  { id: 'avatar-friendly-07', label: 'Resty · Friendly', collection: 'friendly', style: 'illustrated', gender: 'female', ageGroup: 'mature', skinTone: 'deep', url: dicebear('personas', 'resty-friendly') },
  { id: 'avatar-friendly-08', label: 'Peter · Friendly', collection: 'friendly', style: 'illustrated', gender: 'male', ageGroup: 'adult', skinTone: 'deep', url: dicebear('personas', 'peter-friendly') },
  // Casual
  { id: 'avatar-casual-01', label: 'Lydia · Casual', collection: 'casual', style: 'modern-flat', gender: 'female', ageGroup: 'young-adult', skinTone: 'medium', url: dicebear('lorelei', 'lydia-casual') },
  { id: 'avatar-casual-02', label: 'Tom · Casual', collection: 'casual', style: 'modern-flat', gender: 'male', ageGroup: 'young-adult', skinTone: 'deep', url: dicebear('lorelei', 'tom-casual') },
  { id: 'avatar-casual-03', label: 'Faith · Casual', collection: 'casual', style: 'modern-flat', gender: 'female', ageGroup: 'adult', skinTone: 'deep', url: dicebear('lorelei', 'faith-casual') },
  { id: 'avatar-casual-04', label: 'Ivan · Casual', collection: 'casual', style: 'modern-flat', gender: 'male', ageGroup: 'adult', skinTone: 'medium', url: dicebear('lorelei', 'ivan-casual') },
  { id: 'avatar-casual-05', label: 'Joan · Casual', collection: 'casual', style: 'modern-flat', gender: 'female', ageGroup: 'mature', skinTone: 'deep', url: dicebear('lorelei', 'joan-casual') },
  { id: 'avatar-casual-06', label: 'Sam · Casual', collection: 'casual', style: 'modern-flat', gender: 'neutral', ageGroup: 'adult', skinTone: 'medium', url: dicebear('lorelei', 'sam-casual') },
  // Illustrated
  { id: 'avatar-illust-01', label: 'Esther · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'adult', professionHint: 'cleaner', skinTone: 'deep', url: dicebear('avataaars', 'esther-illust') },
  { id: 'avatar-illust-02', label: 'Joseph · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'male', ageGroup: 'adult', professionHint: 'carpenter', skinTone: 'deep', url: dicebear('avataaars', 'joseph-illust') },
  { id: 'avatar-illust-03', label: 'Mercy · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'young-adult', professionHint: 'painter', skinTone: 'medium', url: dicebear('avataaars', 'mercy-illust') },
  { id: 'avatar-illust-04', label: 'Hassan · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'male', ageGroup: 'mature', professionHint: 'welder', skinTone: 'deep', url: dicebear('avataaars', 'hassan-illust') },
  { id: 'avatar-illust-05', label: 'Betty · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'mature', professionHint: 'appliance', skinTone: 'deep', url: dicebear('avataaars', 'betty-illust') },
  { id: 'avatar-illust-06', label: 'Ronald · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'male', ageGroup: 'young-adult', professionHint: 'phone-repair', skinTone: 'medium', url: dicebear('avataaars', 'ronald-illust') },
  { id: 'avatar-illust-07', label: 'Patricia · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'adult', professionHint: 'locksmith', skinTone: 'deep', url: dicebear('avataaars', 'patricia-illust') },
  { id: 'avatar-illust-08', label: 'Wycliffe · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'male', ageGroup: 'adult', professionHint: 'ac', skinTone: 'deep', url: dicebear('avataaars', 'wycliffe-illust') },
  // Modern flat
  { id: 'avatar-flat-01', label: 'Nora · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'female', ageGroup: 'young-adult', skinTone: 'medium', url: dicebear('thumbs', 'nora-flat') },
  { id: 'avatar-flat-02', label: 'Kevin · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'male', ageGroup: 'young-adult', skinTone: 'deep', url: dicebear('thumbs', 'kevin-flat') },
  { id: 'avatar-flat-03', label: 'Irene · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'female', ageGroup: 'adult', skinTone: 'deep', url: dicebear('thumbs', 'irene-flat') },
  { id: 'avatar-flat-04', label: 'Alex · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'neutral', ageGroup: 'adult', skinTone: 'medium', url: dicebear('thumbs', 'alex-flat') },
  { id: 'avatar-flat-05', label: 'Ruth · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'female', ageGroup: 'mature', skinTone: 'deep', url: dicebear('thumbs', 'ruth-flat') },
  { id: 'avatar-flat-06', label: 'George · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'male', ageGroup: 'mature', skinTone: 'deep', url: dicebear('thumbs', 'george-flat') },
  // Realistic-leaning (still non-photographic / stylized)
  { id: 'avatar-real-01', label: 'Carol · Soft realist', collection: 'professional', style: 'realistic', gender: 'female', ageGroup: 'adult', skinTone: 'deep', url: dicebear('adventurer', 'carol-real') },
  { id: 'avatar-real-02', label: 'Francis · Soft realist', collection: 'professional', style: 'realistic', gender: 'male', ageGroup: 'adult', skinTone: 'deep', url: dicebear('adventurer', 'francis-real') },
  { id: 'avatar-real-03', label: 'Harriet · Soft realist', collection: 'friendly', style: 'realistic', gender: 'female', ageGroup: 'young-adult', skinTone: 'medium', url: dicebear('adventurer', 'harriet-real') },
  { id: 'avatar-real-04', label: 'Moses · Soft realist', collection: 'friendly', style: 'realistic', gender: 'male', ageGroup: 'mature', skinTone: 'deep', url: dicebear('adventurer', 'moses-real') },
  { id: 'avatar-real-05', label: 'Peace · Soft realist', collection: 'casual', style: 'realistic', gender: 'female', ageGroup: 'adult', skinTone: 'deep', url: dicebear('adventurer', 'peace-real') },
  { id: 'avatar-real-06', label: 'Simon · Soft realist', collection: 'casual', style: 'realistic', gender: 'male', ageGroup: 'young-adult', skinTone: 'medium', url: dicebear('adventurer', 'simon-real') },

  // Seed Platform / developer catalogue expansion
  { id: 'avatar-seed-dev-01', label: 'Jordan · Developer tech', collection: 'professional', style: 'modern-flat', gender: 'male', ageGroup: 'adult', professionHint: 'multi-trade', skinTone: 'deep', url: dicebear('notionists', 'jordan-mutebi-fixnow-dev') },
  { id: 'avatar-trade-01', label: 'Kato · Plumber', collection: 'illustrated', style: 'illustrated', gender: 'male', ageGroup: 'adult', professionHint: 'plumber', skinTone: 'deep', url: dicebear('avataaars', 'kato-plumber-kampala') },
  { id: 'avatar-trade-02', label: 'Namuli · Electrician', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'adult', professionHint: 'electrician', skinTone: 'deep', url: dicebear('avataaars', 'namuli-electrician') },
  { id: 'avatar-trade-03', label: 'Ocen · Solar', collection: 'professional', style: 'modern-flat', gender: 'male', ageGroup: 'young-adult', professionHint: 'solar', skinTone: 'deep', url: dicebear('notionists', 'ocen-solar-tech') },
  { id: 'avatar-trade-04', label: 'Akello · Painter', collection: 'friendly', style: 'illustrated', gender: 'female', ageGroup: 'young-adult', professionHint: 'painter', skinTone: 'medium', url: dicebear('personas', 'akello-painter') },
  { id: 'avatar-trade-05', label: 'Ssempijja · Mechanic', collection: 'casual', style: 'modern-flat', gender: 'male', ageGroup: 'mature', professionHint: 'mechanic', skinTone: 'deep', url: dicebear('lorelei', 'ssempijja-mechanic') },
  { id: 'avatar-trade-06', label: 'Nabirye · Cleaner', collection: 'friendly', style: 'illustrated', gender: 'female', ageGroup: 'adult', professionHint: 'cleaner', skinTone: 'deep', url: dicebear('personas', 'nabirye-cleaner') },
  { id: 'avatar-trade-07', label: 'Wamala · Locksmith', collection: 'professional', style: 'realistic', gender: 'male', ageGroup: 'adult', professionHint: 'locksmith', skinTone: 'deep', url: dicebear('adventurer', 'wamala-locksmith') },
  { id: 'avatar-trade-08', label: 'Among · AC tech', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'adult', professionHint: 'ac', skinTone: 'medium', url: dicebear('avataaars', 'among-ac-tech') },
  { id: 'avatar-office-01', label: 'Rebecca · Office', collection: 'professional', style: 'modern-flat', gender: 'female', ageGroup: 'adult', professionHint: 'manager', skinTone: 'medium', url: dicebear('notionists', 'rebecca-office-kla') },
  { id: 'avatar-office-02', label: 'Dennis · Office', collection: 'professional', style: 'modern-flat', gender: 'male', ageGroup: 'young-adult', professionHint: 'coordinator', skinTone: 'deep', url: dicebear('notionists', 'dennis-office-ent') },
  { id: 'avatar-office-03', label: 'Flavia · Office', collection: 'friendly', style: 'illustrated', gender: 'female', ageGroup: 'mature', professionHint: 'admin', skinTone: 'deep', url: dicebear('personas', 'flavia-office') },
  { id: 'avatar-flat-07', label: 'Joel · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'male', ageGroup: 'adult', skinTone: 'deep', url: dicebear('thumbs', 'joel-flat-seed') },
  { id: 'avatar-flat-08', label: 'Zainab · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'female', ageGroup: 'young-adult', skinTone: 'medium', url: dicebear('thumbs', 'zainab-flat-seed') },
  { id: 'avatar-flat-09', label: 'Colin · Flat', collection: 'modern-flat', style: 'modern-flat', gender: 'neutral', ageGroup: 'adult', skinTone: 'deep', url: dicebear('thumbs', 'colin-flat-seed') },
  { id: 'avatar-illust-09', label: 'Sharon · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'adult', professionHint: 'network', skinTone: 'deep', url: dicebear('avataaars', 'sharon-network') },
  { id: 'avatar-illust-10', label: 'Ali · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'male', ageGroup: 'young-adult', professionHint: 'cctv', skinTone: 'medium', url: dicebear('avataaars', 'ali-cctv') },
  { id: 'avatar-illust-11', label: 'Doreen · Illustrated', collection: 'illustrated', style: 'illustrated', gender: 'female', ageGroup: 'mature', professionHint: 'roofing', skinTone: 'deep', url: dicebear('avataaars', 'doreen-roofing') },
  { id: 'avatar-real-07', label: 'Henry · Soft realist', collection: 'professional', style: 'realistic', gender: 'male', ageGroup: 'mature', skinTone: 'deep', url: dicebear('adventurer', 'henry-real-seed') },
  { id: 'avatar-real-08', label: 'Prossy · Soft realist', collection: 'friendly', style: 'realistic', gender: 'female', ageGroup: 'adult', skinTone: 'medium', url: dicebear('adventurer', 'prossy-real-seed') },
];

export function getAvatarById(id: string | null | undefined): AvatarDefinition | null {
  if (!id) return null;
  return AVATAR_LIBRARY.find((a) => a.id === id) ?? null;
}

export function listAvatars(opts?: {
  collection?: string;
  gender?: string;
  collections?: string[];
}): AvatarDefinition[] {
  let items = [...AVATAR_LIBRARY];
  if (opts?.collections?.length) {
    items = items.filter((a) => opts.collections!.includes(a.collection));
  }
  if (opts?.collection) items = items.filter((a) => a.collection === opts.collection);
  if (opts?.gender) items = items.filter((a) => a.gender === opts.gender || a.gender === 'neutral');
  return items;
}
