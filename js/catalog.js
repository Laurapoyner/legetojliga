// Alt spilindhold samlet ét sted: legetøjstyper, klasser, aktiviteter,
// pleje, missioner og pokaler. Forældre kan ændre aktiviteterne i forældrepanelet.

export const TOY_TYPES = [
  { id: 'bamse', name: 'Bamse', emoji: '🧸' },
  { id: 'dukke', name: 'Dukke', emoji: '🪆' },
  { id: 'dino', name: 'Dinosaur', emoji: '🦖' },
  { id: 'bil', name: 'Bil', emoji: '🚗' },
  { id: 'robot', name: 'Robot', emoji: '🤖' },
  { id: 'dyr', name: 'Dyr', emoji: '🐰' },
  { id: 'figur', name: 'Figur', emoji: '🦸' },
  { id: 'andet', name: 'Andet', emoji: '⭐' },
];

export const STAT_NAMES = { sty: 'Styrke', for: 'Forsvar', hur: 'Hurtighed' };
export const STAT_ICONS = { sty: 'fitness_center', for: 'shield', hur: 'bolt' };

export const CLASSES = {
  staerk: {
    id: 'staerk',
    name: 'Stærk',
    main: 'sty',
    icon: 'fitness_center',
    desc: 'Slår hårdest',
    special: { name: 'Kæmpeslag', desc: 'Et kæmpe slag, der kan bryde igennem et forsvar.' },
  },
  hurtig: {
    id: 'hurtig',
    name: 'Hurtig',
    main: 'hur',
    icon: 'bolt',
    desc: 'Slår først og rammer oftere plet',
    special: { name: 'Lynangreb', desc: 'Slår altid først og rammer en finte ekstra hårdt.' },
  },
  forsvarer: {
    id: 'forsvarer',
    name: 'Forsvarer',
    main: 'for',
    icon: 'shield',
    desc: 'Tåler mest',
    special: { name: 'Skjoldmur', desc: 'Blokerer et angreb helt og slår igen.' },
  },
};

export const MOVES = {
  angreb: { id: 'angreb', name: 'Angreb', icon: 'swords', hint: 'Slår finter' },
  forsvar: { id: 'forsvar', name: 'Forsvar', icon: 'shield', hint: 'Slår angreb' },
  finte: { id: 'finte', name: 'Finte', icon: 'cyclone', hint: 'Slår forsvar' },
  super: { id: 'super', name: 'Super', icon: 'auto_awesome', hint: 'Én gang pr. kamp' },
};

export const TIERS = [
  { from: 1, title: 'Rekrut', tier: 't1' },
  { from: 5, title: 'Eventyrer', tier: 't2' },
  { from: 10, title: 'Helt', tier: 't3' },
  { from: 15, title: 'Mester', tier: 't4' },
  { from: 20, title: 'Superhelt', tier: 't5' },
  { from: 25, title: 'Legende', tier: 't6' },
];

export const CARE = [
  // cam: barnet viser plejen foran kameraet (kun overkroppen skal kunne ses)
  { id: 'mad', name: 'Giv mad', icon: 'restaurant', energi: 25, glaede: 5, cooldownMin: 180, xp: 5, anim: 'yum', msg: 'Mums! Det smagte godt.',
    cam: { detector: 'handToMouth', target: 6, unit: 'reps', tip: 'Lad som om du fodrer den: før hånden op til munden og ned igen. Mums!' } },
  { id: 'vand', name: 'Giv vand', icon: 'water_drop', energi: 15, glaede: 0, cooldownMin: 120, xp: 4, anim: 'drop', msg: 'Ahh, forfriskende!',
    cam: { detector: 'drink', target: 5, unit: 'sec', tip: 'Hold hånden op til munden, som om du drikker af et glas, og bliv ved.' } },
  { id: 'sov', name: 'Læg i seng', icon: 'bedtime', energi: 40, glaede: 0, cooldownMin: 360, xp: 5, anim: 'zzz', msg: 'Zzz … nu er den udhvilet.',
    cam: { detector: 'sleep', target: 6, unit: 'sec', tip: 'Læg hænderne sammen under kinden som en pude, og stå helt stille. Shh …' } },
  { id: 'vask', name: 'Vask og børst', icon: 'shower', energi: 0, glaede: 15, cooldownMin: 360, xp: 5, anim: 'bubbles', msg: 'Skinnende ren!',
    cam: { detector: 'brush', target: 8, unit: 'sec', tip: 'Børst tænder med en usynlig tandbørste: hånden ved munden, frem og tilbage!' } },
  { id: 'leg', name: 'Leg', icon: 'sports_soccer', energi: -5, glaede: 25, cooldownMin: 60, xp: 5, anim: 'ball', msg: 'Det var sjovt!',
    cam: { detector: 'clapUp', target: 8, unit: 'reps', tip: 'Klap i hænderne højt over hovedet – og ud til siden igen.' } },
  { id: 'kram', name: 'Giv et kram', icon: 'favorite', energi: 0, glaede: 15, cooldownMin: 30, xp: 3, anim: 'hearts', msg: 'Den elsker dig!',
    cam: { detector: 'selfHug', target: 4, unit: 'sec', tip: 'Giv dig selv et stort kram: kryds armene, og tag fat om skuldrene.' } },
];

export const CATEGORIES = [
  { id: 'bevaegelse', name: 'Bevægelse', icon: 'directions_run' },
  { id: 'oprydning', name: 'Oprydning', icon: 'cleaning_services' },
  { id: 'hjaelp', name: 'Hjælp hjemme', icon: 'volunteer_activism' },
  { id: 'kreativ', name: 'Kreativ', icon: 'palette' },
  { id: 'hjerne', name: 'Hjernegymnastik', icon: 'auto_stories' },
  { id: 'ude', name: 'Udenfor', icon: 'park' },
  { id: 'venlig', name: 'Venlighed', icon: 'diversity_1' },
  { id: 'legetoej', name: 'Legetøjet', icon: 'toys' },
];

export const KIND_LABEL = { camera: 'Kamera', photo: 'Foto', adult: 'Voksen' };

const day = (count) => ({ per: 'day', count });
const week = (count) => ({ per: 'week', count });

// kind: camera = kameraet tæller selv · photo = foto + voksen godkender · adult = voksen bekræfter
export const ACTIVITIES = [
  // Bevægelse med kamera
  { id: 'sprael', title: 'Sprællemænd', cat: 'bevaegelse', kind: 'camera', xp: 30, stat: 'hur', limit: day(3), cam: { detector: 'jumpingJack', target: 15, unit: 'reps' }, desc: 'Hop ud med arme og ben – og ind igen.', icon: 'sports_gymnastics' },
  { id: 'squat', title: 'Squats', cat: 'bevaegelse', kind: 'camera', xp: 25, stat: 'sty', limit: day(3), cam: { detector: 'squat', target: 10, unit: 'reps' }, desc: 'Sæt dig ned på en usynlig stol, og rejs dig igen.', icon: 'chair' },
  { id: 'knae', title: 'Høje knæløft', cat: 'bevaegelse', kind: 'camera', xp: 25, stat: 'hur', limit: day(3), cam: { detector: 'highKnees', target: 20, unit: 'reps' }, desc: 'Løft knæene højt – skiftevis højre og venstre.', icon: 'directions_run' },
  { id: 'hop', title: 'Hop på stedet', cat: 'bevaegelse', kind: 'camera', xp: 25, stat: 'sty', limit: day(3), cam: { detector: 'jump', target: 20, unit: 'reps' }, desc: 'Hop med samlede ben, så fødderne slipper gulvet.', icon: 'arrow_upward' },
  { id: 'balance', title: 'Stå på ét ben', cat: 'bevaegelse', kind: 'camera', xp: 25, stat: 'for', limit: day(3), cam: { detector: 'oneLeg', target: 30, unit: 'sec' }, desc: 'Løft den ene fod, og hold balancen.', icon: 'self_improvement' },
  { id: 'helt', title: 'Superhelte-positur', cat: 'bevaegelse', kind: 'camera', xp: 20, stat: 'for', limit: day(3), cam: { detector: 'heroPose', target: 15, unit: 'sec' }, desc: 'Stræk armene op i et stort V, og stå stolt.', icon: 'emoji_people' },
  { id: 'fly', title: 'Flyvemaskinen', cat: 'bevaegelse', kind: 'camera', xp: 20, stat: 'for', limit: day(3), cam: { detector: 'airplane', target: 20, unit: 'sec' }, desc: 'Stræk armene helt ud til siden som vinger.', icon: 'flight' },
  { id: 'dans', title: 'Dans', cat: 'bevaegelse', kind: 'camera', xp: 30, stat: 'alle', limit: day(3), cam: { detector: 'dance', target: 60, unit: 'sec' }, desc: 'Dans løs! Måleren fylder op, når du bevæger dig.', icon: 'music_note' },
  { id: 'loeb', title: 'Løb på stedet', cat: 'bevaegelse', kind: 'camera', xp: 25, stat: 'hur', limit: day(3), cam: { detector: 'run', target: 30, unit: 'sec' }, desc: 'Løb hurtigt på stedet uden at flytte dig.', icon: 'sprint' },
  // Bevægelse som en voksen bekræfter
  { id: 'armst', title: '10 armstrækninger mod væggen', cat: 'bevaegelse', kind: 'adult', xp: 20, stat: 'sty', limit: day(2), desc: 'Stil dig en armslængde fra væggen, og skub dig væk.', icon: 'front_hand' },
  { id: 'taa', title: '20 tåhævninger', cat: 'bevaegelse', kind: 'adult', xp: 20, stat: 'for', limit: day(2), desc: 'Gå op på tæerne og ned igen – langsomt.', icon: 'directions_walk' },
  { id: 'bjoern', title: 'Bjørnegang gennem stuen', cat: 'bevaegelse', kind: 'adult', xp: 20, stat: 'sty', limit: day(2), desc: 'Gå på hænder og fødder som en bjørn.', icon: 'pets' },
  { id: 'bane', title: 'Byg og gennemfør en forhindringsbane', cat: 'bevaegelse', kind: 'adult', xp: 35, stat: 'alle', limit: day(1), desc: 'Puder, stole og tæpper – og så igennem!', icon: 'flag' },

  // Oprydning
  { id: 'vaerelse', title: 'Ryd op på hele værelset', cat: 'oprydning', kind: 'photo', xp: 70, limit: day(1), beforeAfter: true, desc: 'Tag gerne et før-billede – og altid et efter-billede.', icon: 'bed' },
  { id: 'skrivebord', title: 'Ryd op på skrivebordet', cat: 'oprydning', kind: 'photo', xp: 45, limit: day(1), beforeAfter: true, desc: 'Alt på plads, og bordet er frit.', icon: 'desk' },
  { id: 'seng', title: 'Red din seng', cat: 'oprydning', kind: 'photo', xp: 25, limit: day(1), desc: 'Dyne og pude pænt på plads.', icon: 'bed' },
  { id: 'hylde', title: 'Ryd op på legetøjshylden', cat: 'oprydning', kind: 'photo', xp: 35, limit: day(1), beforeAfter: true, desc: 'Alt legetøj tilbage på hylden.', icon: 'shelves' },
  { id: 'lego', title: 'Sorter LEGO i kasser', cat: 'oprydning', kind: 'photo', xp: 35, limit: day(1), beforeAfter: true, desc: 'Klodserne i de rigtige kasser.', icon: 'extension' },
  { id: 'toej', title: 'Læg rent tøj på plads', cat: 'oprydning', kind: 'photo', xp: 30, limit: day(1), desc: 'Foldet og lagt i skuffen eller skabet.', icon: 'checkroom' },
  { id: 'taske', title: 'Pak og organiser skoletasken', cat: 'oprydning', kind: 'photo', xp: 25, limit: day(1), desc: 'Bøger, penalhus og madpakke klar.', icon: 'backpack' },
  { id: 'stoevsug', title: 'Støvsug værelset', cat: 'oprydning', kind: 'adult', xp: 45, limit: week(2), desc: 'Hele gulvet – også under bordet.', icon: 'cleaning_services' },
  { id: 'boeger', title: 'Sæt bøger pænt på plads', cat: 'oprydning', kind: 'photo', xp: 25, limit: day(1), desc: 'Ryggene ud, og ingen bøger på gulvet.', icon: 'auto_stories' },
  { id: 'underseng', title: 'Ryd op under sengen', cat: 'oprydning', kind: 'photo', xp: 40, limit: week(1), beforeAfter: true, desc: 'Hvad gemmer der sig derinde?', icon: 'inventory_2' },
  { id: 'sko', title: 'Stil skoene pænt i entréen', cat: 'oprydning', kind: 'photo', xp: 15, limit: day(1), desc: 'Alle sko på række.', icon: 'hiking' },
  { id: 'genbrug', title: 'Find 5 ting du ikke bruger mere', cat: 'oprydning', kind: 'adult', xp: 35, limit: week(1), desc: 'Til genbrug eller en, der kan bruge dem.', icon: 'recycling' },

  // Hjælp hjemme
  { id: 'daek', title: 'Dæk bord', cat: 'hjaelp', kind: 'adult', xp: 25, limit: day(1), desc: 'Tallerkener, bestik og glas til alle.', icon: 'table_restaurant' },
  { id: 'ryd', title: 'Ryd af bordet', cat: 'hjaelp', kind: 'adult', xp: 20, limit: day(1), desc: 'Alt ud i køkkenet efter maden.', icon: 'dinner_dining' },
  { id: 'opvask', title: 'Tøm opvaskemaskinen', cat: 'hjaelp', kind: 'adult', xp: 30, limit: day(1), desc: 'Alt på plads i skabene.', icon: 'kitchen' },
  { id: 'mad', title: 'Hjælp med madlavningen', cat: 'hjaelp', kind: 'adult', xp: 30, limit: day(1), desc: 'Skræl, rør, smag eller dæk op.', icon: 'soup_kitchen' },
  { id: 'planter', title: 'Vand planterne', cat: 'hjaelp', kind: 'adult', xp: 20, limit: week(2), desc: 'Alle potteplanter får en tår.', icon: 'potted_plant' },
  { id: 'kaeledyr', title: 'Giv kæledyret mad', cat: 'hjaelp', kind: 'adult', xp: 20, limit: day(1), desc: 'Og frisk vand i skålen.', icon: 'pets' },
  { id: 'indkoeb', title: 'Bær indkøbene ind', cat: 'hjaelp', kind: 'adult', xp: 20, limit: day(1), desc: 'Og hjælp med at pakke ud.', icon: 'shopping_bag' },
  { id: 'skrald', title: 'Gå ud med skraldet', cat: 'hjaelp', kind: 'adult', xp: 20, limit: day(1), desc: 'Husk at sortere.', icon: 'delete' },
  { id: 'vasketoej', title: 'Hjælp med vasketøjet', cat: 'hjaelp', kind: 'adult', xp: 25, limit: day(1), desc: 'Sorter, hæng op eller fold.', icon: 'local_laundry_service' },

  // Kreativ
  { id: 'tegning', title: 'Lav en tegning til dit legetøj', cat: 'kreativ', kind: 'photo', xp: 25, limit: day(1), desc: 'Tegn dit legetøj på eventyr.', icon: 'draw' },
  { id: 'byg', title: 'Byg noget med LEGO', cat: 'kreativ', kind: 'photo', xp: 30, limit: day(1), desc: 'Et køretøj, et slot eller et monster.', icon: 'extension' },
  { id: 'hus', title: 'Byg et hus til dit legetøj', cat: 'kreativ', kind: 'photo', xp: 40, limit: week(1), desc: 'Af papkasser, puder eller klodser.', icon: 'cottage' },
  { id: 'kostume', title: 'Lav et kostume til dit legetøj', cat: 'kreativ', kind: 'photo', xp: 40, limit: week(1), desc: 'En kappe, en hat eller en maske.', icon: 'content_cut' },
  { id: 'historie', title: 'Fortæl en historie om dit legetøj', cat: 'kreativ', kind: 'adult', xp: 35, limit: day(1), desc: 'Skriv, tegn eller fortæl den højt.', icon: 'menu_book' },

  // Hjernegymnastik
  { id: 'laes', title: 'Læs i 15 minutter', cat: 'hjerne', kind: 'adult', xp: 30, limit: day(1), desc: 'Selv eller sammen med en voksen.', icon: 'auto_stories' },
  { id: 'lektier', title: 'Øv lektier eller tabeller i 10 minutter', cat: 'hjerne', kind: 'adult', xp: 30, limit: day(1), desc: 'Lidt hver dag hjælper meget.', icon: 'calculate' },
  { id: 'musik', title: 'Øv dig på et instrument', cat: 'hjerne', kind: 'adult', xp: 30, limit: day(1), desc: '10 minutter er nok.', icon: 'piano' },

  // Udenfor
  { id: 'udeleg', title: 'Leg udenfor i 30 minutter', cat: 'ude', kind: 'adult', xp: 30, limit: day(1), desc: 'Have, legeplads eller skov.', icon: 'park' },
  { id: 'tur', title: 'Gå eller cykel en tur', cat: 'ude', kind: 'adult', xp: 30, limit: day(1), desc: 'Sammen med en voksen.', icon: 'pedal_bike' },

  // Venlighed
  { id: 'soeskende', title: 'Hjælp din søskende med noget', cat: 'venlig', kind: 'adult', xp: 25, limit: day(1), desc: 'Spørg, om du kan hjælpe.', icon: 'diversity_1' },
  { id: 'paent', title: 'Sig 3 pæne ting til nogen i familien', cat: 'venlig', kind: 'adult', xp: 20, limit: day(1), desc: 'Og mén dem.', icon: 'sentiment_very_satisfied' },

  // Legetøjet selv
  { id: 'rengoer', title: 'Gør dit rigtige legetøj rent', cat: 'legetoej', kind: 'photo', xp: 30, limit: week(1), desc: 'Børst, tør af eller vask (spørg først).', icon: 'shower' },
  { id: 'eventyr', title: 'Tag dit legetøj med på eventyr', cat: 'legetoej', kind: 'photo', xp: 25, limit: day(1), desc: 'Tag et billede af det et nyt sted.', icon: 'explore' },
];

// Daglige missioner. group sørger for variation: én bevægelse, én opgave, én leg.
export const MISSIONS = [
  { id: 'train2', group: 'move', text: 'Gennemfør 2 træninger', target: 2, xp: 25, metric: 'trainings' },
  { id: 'cam1', group: 'move', text: 'Træn med kameraet', target: 1, xp: 20, metric: 'cameraTrainings' },
  { id: 'sprael30', group: 'move', text: 'Lav 30 sprællemænd i dag', target: 30, xp: 25, metric: 'reps:sprael' },
  { id: 'lowlevel', group: 'move', text: 'Træn et legetøj under level 5', target: 1, xp: 20, metric: 'trainLow', requires: 'lowToy' },
  { id: 'desk', group: 'task', text: 'Ryd op på skrivebordet', target: 1, xp: 25, metric: 'task:skrivebord' },
  { id: 'room', group: 'task', text: 'Ryd op på værelset', target: 1, xp: 30, metric: 'task:vaerelse' },
  { id: 'help1', group: 'task', text: 'Hjælp til derhjemme', target: 1, xp: 25, metric: 'cat:hjaelp' },
  { id: 'creative1', group: 'task', text: 'Lav noget kreativt', target: 1, xp: 25, metric: 'cat:kreativ' },
  { id: 'task2', group: 'task', text: 'Løs 2 opgaver', target: 2, xp: 30, metric: 'tasks' },
  { id: 'care3', group: 'play', text: 'Giv pleje 3 gange', target: 3, xp: 20, metric: 'careActions' },
  { id: 'careToys2', group: 'play', text: 'Pas på 2 forskellige stykker legetøj', target: 2, xp: 20, metric: 'caredToys', requires: 'twoToys' },
  { id: 'battle1', group: 'play', text: 'Gennemfør en kamp', target: 1, xp: 20, metric: 'battles', requires: 'opponent' },
];

export const ACHIEVEMENTS = [
  { id: 'first_toy', title: 'Første ven', desc: 'Opret dit første legetøj', icon: 'toys', check: (c) => c.toys >= 1 },
  { id: 'collector', title: 'Samler', desc: 'Hav 5 stykker legetøj', icon: 'inventory_2', check: (c) => c.toys >= 5 },
  { id: 'first_train', title: 'Første træning', desc: 'Gennemfør en træning', icon: 'fitness_center', check: (c) => c.trainings >= 1 },
  { id: 'train25', title: 'Træningsglad', desc: 'Gennemfør 25 træninger', icon: 'sprint', check: (c) => c.trainings >= 25 },
  { id: 'sprael100', title: 'Sprællemand', desc: 'Lav 100 sprællemænd', icon: 'sports_gymnastics', check: (c) => (c.reps.sprael || 0) >= 100 },
  { id: 'squat100', title: 'Squat-stjerne', desc: 'Lav 100 squats', icon: 'chair', check: (c) => (c.reps.squat || 0) >= 100 },
  { id: 'first_win', title: 'Første sejr', desc: 'Vind en kamp', icon: 'emoji_events', check: (c) => c.wins >= 1 },
  { id: 'champion', title: 'Arena-mester', desc: 'Vind 10 kampe', icon: 'military_tech', check: (c) => c.wins >= 10 },
  { id: 'fighter', title: 'Kæmpehjerte', desc: 'Gennemfør 25 kampe', icon: 'swords', check: (c) => c.battles >= 25 },
  { id: 'clean10', title: 'Oprydningsmester', desc: 'Få 10 oprydninger godkendt', icon: 'cleaning_services', check: (c) => (c.cats.oprydning || 0) >= 10 },
  { id: 'help10', title: 'Superhjælper', desc: 'Hjælp til 10 gange', icon: 'volunteer_activism', check: (c) => (c.cats.hjaelp || 0) >= 10 },
  { id: 'creative5', title: 'Kunstner', desc: 'Lav 5 kreative opgaver', icon: 'palette', check: (c) => (c.cats.kreativ || 0) >= 5 },
  { id: 'care50', title: 'Omsorgsfuld', desc: 'Giv pleje 50 gange', icon: 'favorite', check: (c) => c.care >= 50 },
  { id: 'missions10', title: 'Missionsmester', desc: 'Klar 10 missioner', icon: 'flag', check: (c) => c.missions >= 10 },
  { id: 'lvl5', title: 'Eventyrer', desc: 'Få et legetøj op på level 5', icon: 'star', check: (c) => c.maxLevel >= 5 },
  { id: 'lvl10', title: 'Helt', desc: 'Få et legetøj op på level 10', icon: 'star', check: (c) => c.maxLevel >= 10 },
  { id: 'lvl15', title: 'Mester', desc: 'Få et legetøj op på level 15', icon: 'workspace_premium', check: (c) => c.maxLevel >= 15 },
  { id: 'lvl20', title: 'Superhelt', desc: 'Få et legetøj op på level 20', icon: 'workspace_premium', check: (c) => c.maxLevel >= 20 },
  { id: 'lvl25', title: 'Legende', desc: 'Få et legetøj op på level 25', icon: 'auto_awesome', check: (c) => c.maxLevel >= 25 },
];

export const AVATAR_COLORS = ['#FF6B57', '#3A7BFF', '#15B392', '#FFB020', '#A45CFF', '#FF5FA2'];

export const NAME_FIRST = ['Kaptajn', 'Sir', 'Lille', 'Store', 'Super', 'Lyn', 'Prinsesse', 'Hr.', 'Fru', 'Mester', 'Turbo', 'Doktor'];
export const NAME_LAST = ['Krummel', 'Brumbasse', 'Pjuske', 'Tumle', 'Snøvs', 'Bolle', 'Fnuller', 'Kringle', 'Stjerneskud', 'Rasle', 'Vimse', 'Klonk', 'Pusling', 'Grubli'];

export const DIFFICULTY = {
  let: { name: 'Let', factor: 0.6, note: 'Til de mindste – færre gentagelser og mere lempelig optælling' },
  normal: { name: 'Normal', factor: 1, note: 'Som standard' },
  svaer: { name: 'Svær', factor: 1.4, note: 'Flere gentagelser og strengere optælling' },
};
