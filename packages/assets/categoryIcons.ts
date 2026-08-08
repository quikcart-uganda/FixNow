/**
 * FixNow service-category icon catalogue.
 * Values are Material Symbols Outlined ligature names (persisted on Category.icon).
 * Keep outline-style only — never mix filled / custom SVG sets here.
 */

export type CategoryIconGroup =
  | 'Electrical'
  | 'Plumbing & Water'
  | 'Construction'
  | 'Home Interior'
  | 'HVAC & Cooling'
  | 'Cleaning'
  | 'Outdoor'
  | 'Security'
  | 'Automotive'
  | 'Technology'
  | 'Appliances & Electronics'
  | 'Health & Care'
  | 'Beauty & Wellness'
  | 'Education'
  | 'Events & Creative'
  | 'Food & Hospitality'
  | 'Business & Logistics'
  | 'Emergency'
  | 'General'

export type CategoryIconOption = {
  /** Material Symbol name persisted on Category.icon */
  value: string
  /** Human label shown in the picker */
  label: string
  /** Picker section */
  group: CategoryIconGroup
  /** Extra search terms (aliases / keywords) */
  aliases: string[]
}

export const CATEGORY_ICON_GROUPS: CategoryIconGroup[] = [
  'Electrical',
  'Plumbing & Water',
  'Construction',
  'Home Interior',
  'HVAC & Cooling',
  'Cleaning',
  'Outdoor',
  'Security',
  'Automotive',
  'Technology',
  'Appliances & Electronics',
  'Health & Care',
  'Beauty & Wellness',
  'Education',
  'Events & Creative',
  'Food & Hospitality',
  'Business & Logistics',
  'Emergency',
  'General',
]

/** Production catalogue — unique Material Symbol ids for 100+ service verticals. */
export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  // —— Electrical ——
  { value: 'electrical_services', label: 'Electrical', group: 'Electrical', aliases: ['electric', 'electrician', 'wiring', 'socket', 'power'] },
  { value: 'bolt', label: 'Power', group: 'Electrical', aliases: ['electric', 'energy', 'surge', 'power'] },
  { value: 'lightbulb', label: 'Lighting', group: 'Electrical', aliases: ['electric', 'lamp', 'bulb', 'led', 'lights'] },
  { value: 'solar_power', label: 'Solar', group: 'Electrical', aliases: ['electric', 'panel', 'inverter', 'pv', 'sun'] },
  { value: 'power', label: 'Generator / Backup', group: 'Electrical', aliases: ['electric', 'generator', 'backup', 'ups', 'standby'] },
  { value: 'battery_charging_full', label: 'Battery Systems', group: 'Electrical', aliases: ['electric', 'battery', 'storage', 'inverter'] },
  { value: 'electric_meter', label: 'Metering', group: 'Electrical', aliases: ['electric', 'meter', 'prepaid', 'yaka'] },
  { value: 'settings_input_component', label: 'Transformer / Switchgear', group: 'Electrical', aliases: ['electric', 'transformer', 'switchgear', 'panel'] },
  { value: 'outlet', label: 'Sockets & Outlets', group: 'Electrical', aliases: ['electric', 'socket', 'plug', 'outlet'] },
  { value: 'cable', label: 'Cabling', group: 'Electrical', aliases: ['electric', 'cable', 'wire', 'conduit'] },

  // —— Plumbing & Water ——
  { value: 'plumbing', label: 'Plumbing', group: 'Plumbing & Water', aliases: ['pipe', 'leak', 'tap', 'toilet', 'plumber'] },
  { value: 'water_drop', label: 'Water', group: 'Plumbing & Water', aliases: ['water', 'pipe', 'supply'] },
  { value: 'water', label: 'Water Systems', group: 'Plumbing & Water', aliases: ['water', 'tank', 'borehole', 'pump'] },
  { value: 'valve', label: 'Valves & Drainage', group: 'Plumbing & Water', aliases: ['drainage', 'sewer', 'valve', 'drain'] },
  { value: 'hot_tub', label: 'Swimming Pools', group: 'Plumbing & Water', aliases: ['pool', 'swim', 'spa', 'jacuzzi'] },
  { value: 'bathtub', label: 'Bathrooms', group: 'Plumbing & Water', aliases: ['bathroom', 'shower', 'bath', 'sink'] },
  { value: 'opacity', label: 'Water Tanks', group: 'Plumbing & Water', aliases: ['tank', 'reservoir', 'storage'] },
  { value: 'waves', label: 'Irrigation', group: 'Plumbing & Water', aliases: ['irrigation', 'sprinkler', 'drip'] },

  // —— Construction ——
  { value: 'foundation', label: 'Construction', group: 'Construction', aliases: ['build', 'site', 'contractor', 'masonry'] },
  { value: 'construction', label: 'Building Works', group: 'Construction', aliases: ['construction', 'site', 'hardhat'] },
  { value: 'architecture', label: 'Architecture', group: 'Construction', aliases: ['architect', 'blueprint', 'design'] },
  { value: 'engineering', label: 'Engineering', group: 'Construction', aliases: ['engineer', 'structural', 'civil'] },
  { value: 'square_foot', label: 'Surveying', group: 'Construction', aliases: ['survey', 'measure', 'land'] },
  { value: 'roofing', label: 'Roofing', group: 'Construction', aliases: ['roof', 'gutter', 'sheet', 'tiles'] },
  { value: 'carpenter', label: 'Carpentry', group: 'Construction', aliases: ['wood', 'joiner', 'timber', 'door'] },
  { value: 'cabin', label: 'Joinery', group: 'Construction', aliases: ['joinery', 'cabinet', 'woodwork'] },
  { value: 'grid_view', label: 'Tiling', group: 'Construction', aliases: ['tile', 'tiles', 'ceramic', 'porcelain'] },
  { value: 'layers', label: 'Flooring', group: 'Construction', aliases: ['floor', 'laminate', 'parquet', 'vinyl'] },
  { value: 'apartment', label: 'Ceiling Works', group: 'Construction', aliases: ['ceiling', 'gypsum', 'pop', 'suspended'] },
  { value: 'fence', label: 'Fencing', group: 'Construction', aliases: ['fence', 'gate', 'perimeter'] },
  { value: 'cottage', label: 'Masonry', group: 'Construction', aliases: ['brick', 'stone', 'plaster', 'mason'] },
  { value: 'landscape', label: 'Paving', group: 'Construction', aliases: ['paving', 'driveway', 'interlock', 'concrete'] },
  { value: 'home', label: 'Home Structure', group: 'Construction', aliases: ['house', 'home', 'building'] },
  { value: 'window', label: 'Glass & Aluminium', group: 'Construction', aliases: ['glass', 'aluminium', 'window', 'sliding'] },
  { value: 'door_front', label: 'Doors', group: 'Construction', aliases: ['door', 'frame', 'hinge'] },
  { value: 'imagesearch_roller', label: 'Wood Polishing', group: 'Construction', aliases: ['polish', 'varnish', 'wood finish', 'lacquer'] },

  // —— Home Interior ——
  { value: 'format_paint', label: 'Painting', group: 'Home Interior', aliases: ['paint', 'decorator', 'wall'] },
  { value: 'wallpaper', label: 'Wallpaper', group: 'Home Interior', aliases: ['wallpaper', 'decor', 'wall covering'] },
  { value: 'design_services', label: 'Interior Design', group: 'Home Interior', aliases: ['interior', 'decor', 'design', 'styling'] },
  { value: 'curtains', label: 'Curtains & Blinds', group: 'Home Interior', aliases: ['curtain', 'blinds', 'drapes', 'shades'] },
  { value: 'chair', label: 'Furniture Assembly', group: 'Home Interior', aliases: ['furniture', 'assembly', 'flatpack', 'ikea'] },
  { value: 'table_restaurant', label: 'Cabinetry', group: 'Home Interior', aliases: ['cabinet', 'kitchen unit', 'wardrobe'] },
  { value: 'shelves', label: 'Shelving', group: 'Home Interior', aliases: ['shelf', 'storage', 'rack'] },
  { value: 'countertops', label: 'Countertops', group: 'Home Interior', aliases: ['counter', 'granite', 'marble', 'worktop'] },
  { value: 'light', label: 'Decor Lighting', group: 'Home Interior', aliases: ['decor', 'fixture', 'chandelier', 'light'] },

  // —— HVAC & Cooling ——
  { value: 'mode_fan', label: 'HVAC', group: 'HVAC & Cooling', aliases: ['hvac', 'ventilation', 'fan', 'air'] },
  { value: 'ac_unit', label: 'Air Conditioning', group: 'HVAC & Cooling', aliases: ['ac', 'aircon', 'cooling', 'hvac', 'air conditioning'] },
  { value: 'mode_cool', label: 'Cooling Systems', group: 'HVAC & Cooling', aliases: ['cool', 'chiller', 'cold'] },
  { value: 'mode_heat', label: 'Heating', group: 'HVAC & Cooling', aliases: ['heat', 'heater', 'boiler'] },
  { value: 'kitchen', label: 'Refrigeration', group: 'HVAC & Cooling', aliases: ['fridge', 'freezer', 'cold room', 'refrigeration'] },
  { value: 'thermostat', label: 'Climate Control', group: 'HVAC & Cooling', aliases: ['thermostat', 'temperature', 'climate'] },
  { value: 'air', label: 'Ventilation', group: 'HVAC & Cooling', aliases: ['vent', 'duct', 'exhaust'] },

  // —— Cleaning ——
  { value: 'cleaning_services', label: 'Cleaning', group: 'Cleaning', aliases: ['clean', 'housekeeping', 'maid'] },
  { value: 'sanitizer', label: 'Deep Cleaning / Sanitize', group: 'Cleaning', aliases: ['sanitize', 'disinfect', 'deep clean'] },
  { value: 'cleaning_bucket', label: 'Office Cleaning', group: 'Cleaning', aliases: ['office', 'commercial', 'janitor'] },
  { value: 'window_closed', label: 'Window Cleaning', group: 'Cleaning', aliases: ['window', 'glass clean', 'facade'] },
  { value: 'water_lux', label: 'Pressure Washing', group: 'Cleaning', aliases: ['pressure', 'power wash', 'jet wash'] },
  { value: 'weekend', label: 'Carpet Cleaning', group: 'Cleaning', aliases: ['carpet', 'rug', 'upholstery'] },
  { value: 'local_laundry_service', label: 'Laundry', group: 'Cleaning', aliases: ['laundry', 'wash', 'dry clean', 'ironing'] },
  { value: 'dry_cleaning', label: 'Dry Cleaning', group: 'Cleaning', aliases: ['dry clean', 'pressing', 'suit'] },
  { value: 'recycling', label: 'Recycling', group: 'Cleaning', aliases: ['recycle', 'waste sort', 'eco'] },
  { value: 'delete_sweep', label: 'Waste Collection', group: 'Cleaning', aliases: ['garbage', 'rubbish', 'trash', 'waste'] },

  // —— Outdoor ——
  { value: 'yard', label: 'Gardening', group: 'Outdoor', aliases: ['garden', 'plants', 'horticulture'] },
  { value: 'grass', label: 'Lawn Care', group: 'Outdoor', aliases: ['lawn', 'mow', 'turf', 'grass'] },
  { value: 'park', label: 'Landscaping', group: 'Outdoor', aliases: ['landscape', 'outdoor', 'garden design'] },
  { value: 'forest', label: 'Tree Cutting', group: 'Outdoor', aliases: ['tree', 'pruning', 'arborist', 'felling'] },
  { value: 'compost', label: 'Composting', group: 'Outdoor', aliases: ['compost', 'organic', 'mulch'] },
  { value: 'pest_control', label: 'Pest Control', group: 'Outdoor', aliases: ['pest', 'insect', 'termite', 'rodent'] },
  { value: 'bug_report', label: 'Fumigation', group: 'Outdoor', aliases: ['fumigation', 'pest', 'spray', 'insects'] },
  { value: 'sprinkler', label: 'Outdoor Irrigation', group: 'Outdoor', aliases: ['sprinkler', 'irrigation', 'garden water'] },

  // —— Security ——
  { value: 'security', label: 'Security Systems', group: 'Security', aliases: ['security', 'guard', 'protection'] },
  { value: 'videocam', label: 'CCTV', group: 'Security', aliases: ['cctv', 'camera', 'surveillance', 'video'] },
  { value: 'lock', label: 'Locksmith', group: 'Security', aliases: ['lock', 'key', 'locksmith', 'entry'] },
  { value: 'key', label: 'Key Cutting', group: 'Security', aliases: ['key', 'duplicate', 'locksmith'] },
  { value: 'badge', label: 'Access Control', group: 'Security', aliases: ['access', 'biometric', 'card reader', 'gate'] },
  { value: 'notifications_active', label: 'Alarm Systems', group: 'Security', aliases: ['alarm', 'siren', 'intruder'] },
  { value: 'sensors', label: 'Sensors', group: 'Security', aliases: ['sensor', 'motion', 'detector'] },
  { value: 'home_iot_device', label: 'Home Automation', group: 'Security', aliases: ['smart home', 'automation', 'iot', 'alexa'] },
  { value: 'shield', label: 'Safes', group: 'Security', aliases: ['safe', 'vault', 'strongroom'] },
  { value: 'satellite_alt', label: 'Satellite TV', group: 'Security', aliases: ['dstv', 'satellite', 'dish', 'decoder'] },

  // —— Automotive ——
  { value: 'directions_car', label: 'Vehicle Repair', group: 'Automotive', aliases: ['car', 'mechanic', 'auto', 'vehicle'] },
  { value: 'car_repair', label: 'Mechanics', group: 'Automotive', aliases: ['car', 'mechanic', 'garage', 'service'] },
  { value: 'two_wheeler', label: 'Motorcycle Repair', group: 'Automotive', aliases: ['moto', 'bike', 'boda', 'motorcycle'] },
  { value: 'tire_repair', label: 'Tyres', group: 'Automotive', aliases: ['car', 'tyre', 'tire', 'puncture', 'wheel'] },
  { value: 'battery_full', label: 'Car Battery', group: 'Automotive', aliases: ['car', 'battery', 'jumpstart'] },
  { value: 'local_car_wash', label: 'Car Wash', group: 'Automotive', aliases: ['car', 'wash', 'clean', 'valet'] },
  { value: 'star', label: 'Auto Detailing', group: 'Automotive', aliases: ['car', 'detail', 'polish', 'wax'] },
  { value: 'oil_barrel', label: 'Oil Change', group: 'Automotive', aliases: ['car', 'oil', 'service', 'lube'] },
  { value: 'local_taxi', label: 'Transport', group: 'Automotive', aliases: ['taxi', 'transport', 'ride'] },
  { value: 'airport_shuttle', label: 'Shuttle / Transfer', group: 'Automotive', aliases: ['shuttle', 'transfer', 'airport'] },

  // —— Technology ——
  { value: 'computer', label: 'IT Support', group: 'Technology', aliases: ['it', 'computer', 'tech', 'support'] },
  { value: 'wifi', label: 'Internet & Networking', group: 'Technology', aliases: ['wifi', 'internet', 'network', 'router', 'lan'] },
  { value: 'router', label: 'Networking Gear', group: 'Technology', aliases: ['router', 'switch', 'network', 'lan'] },
  { value: 'dns', label: 'Web Design', group: 'Technology', aliases: ['web', 'website', 'frontend', 'design'] },
  { value: 'code', label: 'Software', group: 'Technology', aliases: ['software', 'app', 'dev', 'programming'] },
  { value: 'cloud', label: 'Cloud Services', group: 'Technology', aliases: ['cloud', 'hosting', 'saas', 'server'] },
  { value: 'security_update_good', label: 'Cybersecurity', group: 'Technology', aliases: ['cyber', 'security', 'malware', 'firewall'] },
  { value: 'sd_card', label: 'Data Recovery', group: 'Technology', aliases: ['data', 'recovery', 'backup', 'hard drive'] },
  { value: 'print', label: 'Printing', group: 'Technology', aliases: ['print', 'printer', 'photocopy'] },
  { value: 'draw', label: 'Graphic Design', group: 'Technology', aliases: ['graphic', 'logo', 'branding', 'design'] },
  { value: 'flight', label: 'Drone Services', group: 'Technology', aliases: ['drone', 'uav', 'aerial', 'mapping'] },
  { value: 'smartphone', label: 'Phone Repair', group: 'Technology', aliases: ['phone', 'mobile', 'screen', 'iphone'] },
  { value: 'laptop_mac', label: 'Laptop Repair', group: 'Technology', aliases: ['laptop', 'notebook', 'macbook', 'pc'] },
  { value: 'devices', label: 'Gadgets', group: 'Technology', aliases: ['gadget', 'device', 'tablet'] },

  // —— Appliances & Electronics ——
  { value: 'tv', label: 'TV Repair', group: 'Appliances & Electronics', aliases: ['tv', 'television', 'screen', 'electronics'] },
  { value: 'speaker', label: 'Audio Systems', group: 'Appliances & Electronics', aliases: ['speaker', 'sound', 'audio', 'hi-fi'] },
  { value: 'microwave', label: 'Microwave Repair', group: 'Appliances & Electronics', aliases: ['microwave', 'appliance', 'kitchen'] },
  { value: 'oven_gen', label: 'Cooker / Oven', group: 'Appliances & Electronics', aliases: ['cooker', 'oven', 'stove', 'appliance'] },
  { value: 'dishwasher_gen', label: 'Dishwasher', group: 'Appliances & Electronics', aliases: ['dishwasher', 'appliance'] },
  { value: 'iron', label: 'Iron / Steamer', group: 'Appliances & Electronics', aliases: ['iron', 'steam', 'press'] },
  { value: 'memory', label: 'Electronics', group: 'Appliances & Electronics', aliases: ['electronics', 'circuit', 'board'] },
  { value: 'build_circle', label: 'Appliance Repair', group: 'Appliances & Electronics', aliases: ['appliance', 'repair', 'service'] },

  // —— Health & Care ——
  { value: 'medical_services', label: 'Medical Equipment', group: 'Health & Care', aliases: ['medical', 'hospital', 'equipment', 'health'] },
  { value: 'local_hospital', label: 'Nursing', group: 'Health & Care', aliases: ['nurse', 'nursing', 'care', 'health'] },
  { value: 'elderly', label: 'Caregiving', group: 'Health & Care', aliases: ['caregiver', 'elderly', 'home care'] },
  { value: 'child_care', label: 'Babysitting', group: 'Health & Care', aliases: ['baby', 'nanny', 'childcare', 'sitter'] },
  { value: 'pets', label: 'Pet Care', group: 'Health & Care', aliases: ['pet', 'dog', 'cat', 'animal'] },
  { value: 'cruelty_free', label: 'Dog Walking', group: 'Health & Care', aliases: ['dog', 'walk', 'pet'] },
  { value: 'vaccines', label: 'Veterinary', group: 'Health & Care', aliases: ['vet', 'veterinary', 'animal clinic'] },
  { value: 'monitor_heart', label: 'Health Monitoring', group: 'Health & Care', aliases: ['health', 'vitals', 'checkup'] },
  { value: 'medication', label: 'Pharmacy Support', group: 'Health & Care', aliases: ['pharmacy', 'medicine', 'drugs'] },

  // —— Beauty & Wellness ——
  { value: 'content_cut', label: 'Hair / Barber', group: 'Beauty & Wellness', aliases: ['hair', 'barber', 'salon', 'cut'] },
  { value: 'face', label: 'Beauty', group: 'Beauty & Wellness', aliases: ['beauty', 'makeup', 'cosmetics'] },
  { value: 'spa', label: 'Spa', group: 'Beauty & Wellness', aliases: ['spa', 'wellness', 'relax'] },
  { value: 'self_care', label: 'Massage', group: 'Beauty & Wellness', aliases: ['massage', 'therapy', 'body'] },
  { value: 'fitness_center', label: 'Fitness', group: 'Beauty & Wellness', aliases: ['gym', 'fitness', 'workout'] },
  { value: 'sports_gymnastics', label: 'Personal Trainer', group: 'Beauty & Wellness', aliases: ['trainer', 'coach', 'fitness', 'pt'] },
  { value: 'brush', label: 'Nails', group: 'Beauty & Wellness', aliases: ['nails', 'manicure', 'pedicure'] },
  { value: 'styler', label: 'Styling', group: 'Beauty & Wellness', aliases: ['style', 'grooming', 'fashion'] },

  // —— Education ——
  { value: 'school', label: 'Tutoring', group: 'Education', aliases: ['tutor', 'teacher', 'lessons', 'study'] },
  { value: 'menu_book', label: 'Language Lessons', group: 'Education', aliases: ['language', 'english', 'french', 'lessons'] },
  { value: 'music_note', label: 'Music Lessons', group: 'Education', aliases: ['music', 'piano', 'guitar', 'lessons'] },
  { value: 'calculate', label: 'Math / STEM', group: 'Education', aliases: ['math', 'science', 'stem', 'tuition'] },
  { value: 'cast_for_education', label: 'Online Learning', group: 'Education', aliases: ['online', 'elearning', 'course'] },
  { value: 'psychology', label: 'Coaching', group: 'Education', aliases: ['coach', 'mentor', 'counsel'] },

  // —— Events & Creative ——
  { value: 'photo_camera', label: 'Photography', group: 'Events & Creative', aliases: ['photo', 'camera', 'shoot', 'portrait'] },
  { value: 'movie', label: 'Videography', group: 'Events & Creative', aliases: ['video', 'film', 'cinema', 'shoot'] },
  { value: 'album', label: 'DJ / Music', group: 'Events & Creative', aliases: ['dj', 'music', 'party', 'sound'] },
  { value: 'celebration', label: 'Events', group: 'Events & Creative', aliases: ['event', 'party', 'wedding', 'function'] },
  { value: 'theater_comedy', label: 'Entertainment', group: 'Events & Creative', aliases: ['entertainment', 'show', 'mc'] },
  { value: 'palette', label: 'Art & Decor', group: 'Events & Creative', aliases: ['art', 'paint', 'creative'] },
  { value: 'signpost', label: 'Signage', group: 'Events & Creative', aliases: ['sign', 'signage', 'banner', 'branding'] },
  { value: 'campaign', label: 'Marketing Activations', group: 'Events & Creative', aliases: ['promo', 'activation', 'brand'] },

  // —— Food & Hospitality ——
  { value: 'restaurant', label: 'Catering', group: 'Food & Hospitality', aliases: ['catering', 'food', 'chef', 'buffet'] },
  { value: 'bakery_dining', label: 'Bakery', group: 'Food & Hospitality', aliases: ['bakery', 'cake', 'bread', 'pastry'] },
  { value: 'local_cafe', label: 'Cafe Services', group: 'Food & Hospitality', aliases: ['cafe', 'coffee', 'barista'] },
  { value: 'room_service', label: 'Hospitality', group: 'Food & Hospitality', aliases: ['hotel', 'hospitality', 'service'] },
  { value: 'liquor', label: 'Bar Services', group: 'Food & Hospitality', aliases: ['bar', 'bartender', 'drinks'] },

  // —— Business & Logistics ——
  { value: 'local_shipping', label: 'Moving', group: 'Business & Logistics', aliases: ['moving', 'relocation', 'movers', 'pack'] },
  { value: 'local_post_office', label: 'Courier', group: 'Business & Logistics', aliases: ['courier', 'parcel', 'dispatch'] },
  { value: 'package_2', label: 'Delivery', group: 'Business & Logistics', aliases: ['delivery', 'dropoff', 'logistics'] },
  { value: 'inventory_2', label: 'Warehousing', group: 'Business & Logistics', aliases: ['warehouse', 'storage', 'inventory'] },
  { value: 'business_center', label: 'Business Services', group: 'Business & Logistics', aliases: ['business', 'office', 'corporate'] },
  { value: 'storefront', label: 'Shop Fitting', group: 'Business & Logistics', aliases: ['shop', 'retail', 'store'] },
  { value: 'handshake', label: 'Consulting', group: 'Business & Logistics', aliases: ['consult', 'advisor', 'business'] },
  { value: 'receipt_long', label: 'Bookkeeping', group: 'Business & Logistics', aliases: ['accounts', 'bookkeeping', 'finance'] },
  { value: 'gavel', label: 'Legal Support', group: 'Business & Logistics', aliases: ['legal', 'lawyer', 'notary'] },
  { value: 'checkroom', label: 'Tailoring / Fashion', group: 'Business & Logistics', aliases: ['tailor', 'fashion', 'sewing', 'alteration'] },
  { value: 'precision_manufacturing', label: 'Metal Fabrication', group: 'Business & Logistics', aliases: ['metal', 'steel', 'fabricate', 'weld'] },
  { value: 'hardware', label: 'Welding', group: 'Business & Logistics', aliases: ['weld', 'metal', 'arc', 'fabrication'] },

  // —— Emergency ——
  { value: 'emergency', label: 'Emergency Services', group: 'Emergency', aliases: ['emergency', 'urgent', '24hr', 'sos'] },
  { value: 'e911_emergency', label: 'Urgent Call-out', group: 'Emergency', aliases: ['urgent', 'emergency', 'asap'] },
  { value: 'fire_extinguisher', label: 'Fire Safety', group: 'Emergency', aliases: ['fire', 'extinguisher', 'safety'] },
  { value: 'smoke_free', label: 'Fire Inspection', group: 'Emergency', aliases: ['fire', 'inspection', 'smoke', 'alarm'] },
  { value: 'health_and_safety', label: 'Safety Inspection', group: 'Emergency', aliases: ['inspection', 'safety', 'compliance', 'audit'] },
  { value: 'warning', label: 'Hazard Response', group: 'Emergency', aliases: ['hazard', 'danger', 'warning'] },

  // —— General ——
  { value: 'handyman', label: 'Handyman / General Repair', group: 'General', aliases: ['handyman', 'general', 'repair', 'fix', 'multi'] },
  { value: 'build', label: 'Tools & Maintenance', group: 'General', aliases: ['tools', 'maintain', 'service'] },
  { value: 'home_repair_service', label: 'Home Repair', group: 'General', aliases: ['home', 'repair', 'fix', 'maintenance'] },
  { value: 'home_work', label: 'Odd Jobs', group: 'General', aliases: ['odd jobs', 'misc', 'small jobs'] },
  { value: 'more_horiz', label: 'Other Services', group: 'General', aliases: ['other', 'misc', 'custom'] },
  { value: 'support_agent', label: 'Concierge Support', group: 'General', aliases: ['concierge', 'help', 'support'] },
]

export function categoryIconLabel(value: string): string {
  const found = CATEGORY_ICON_OPTIONS.find((o) => o.value === value)
  if (found) return found.label
  return value || 'General Repair'
}

export function categoryIconByValue(value: string): CategoryIconOption | undefined {
  return CATEGORY_ICON_OPTIONS.find((o) => o.value === value)
}

/** Match label, value, group tokens, or any alias/keyword. */
export function filterCategoryIcons(
  query: string,
  group: CategoryIconGroup | 'All' = 'All',
): CategoryIconOption[] {
  const q = query.trim().toLowerCase()
  return CATEGORY_ICON_OPTIONS.filter((opt) => {
    if (group !== 'All' && opt.group !== group) return false
    if (!q) return true
    if (opt.label.toLowerCase().includes(q)) return true
    if (opt.value.toLowerCase().includes(q)) return true
    // Tokenize group so "car" does not hit "Health & Care"
    const groupTokens = opt.group.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    if (groupTokens.some((token) => token.startsWith(q))) return true
    return opt.aliases.some((alias) => {
      const a = alias.toLowerCase()
      if (a.includes(q)) return true
      // Allow short query expansion only when alias is a meaningful stem
      return q.length >= 3 && a.length >= 3 && q.includes(a)
    })
  })
}

/** Group filtered icons for section headers in the picker list. */
export function groupCategoryIcons(options: CategoryIconOption[]): Array<{
  group: CategoryIconGroup
  icons: CategoryIconOption[]
}> {
  const map = new Map<CategoryIconGroup, CategoryIconOption[]>()
  for (const opt of options) {
    const list = map.get(opt.group) ?? []
    list.push(opt)
    map.set(opt.group, list)
  }
  return CATEGORY_ICON_GROUPS.filter((g) => map.has(g)).map((g) => ({
    group: g,
    icons: map.get(g)!,
  }))
}

export const CATEGORY_ICON_COUNT = CATEGORY_ICON_OPTIONS.length
