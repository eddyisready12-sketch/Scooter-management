import type {
  ComplianceFamilyDocument,
  ComplianceFamilyRequirement,
  ComplianceFamilyRevision,
  ComplianceFamilyRisk,
  ComplianceFamilyTestPlan,
  ComplianceFamilyStatus,
  ComplianceFamilyWarning,
  ComplianceProductFamily,
  ComplianceProductLink,
  ComplianceProductTest,
  ComplianceRiskLevel,
  Product,
} from '../types';

type ComplianceTemplate = {
  code: string;
  name: string;
  category: string;
  description: string;
  intendedUse: string;
  foreseeableMisuse: string;
  riskLevel: ComplianceRiskLevel;
  keywords: string[];
  risks: Array<{
    hazard: string;
    riskDescription: string;
    severity: string;
    probability: string;
    mitigation: string;
    residualRisk: string;
  }>;
  warnings: Array<{
    warningType: string;
    warningTextNl: string;
    warningTextEn?: string;
    requiredOnLabel?: boolean;
    requiredInManual?: boolean;
  }>;
};

type ComplianceRequirementTemplate = {
  name: string;
  regulation?: string;
  mandatory?: boolean;
  notes?: string;
};

type ComplianceTestPlanTemplate = {
  name: string;
  method?: string;
  frequency?: string;
  mandatory?: boolean;
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeText(value?: string) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function familyIdForCode(code: string) {
  return `compliance-family-${slugify(code)}`;
}

function riskIdForCode(code: string, index: number) {
  return `compliance-risk-${slugify(code)}-${index + 1}`;
}

function warningIdForCode(code: string, index: number) {
  return `compliance-warning-${slugify(code)}-${index + 1}`;
}

function requirementIdForCode(code: string, index: number) {
  return `compliance-requirement-${slugify(code)}-${index + 1}`;
}

function testPlanIdForCode(code: string, index: number) {
  return `compliance-test-plan-${slugify(code)}-${index + 1}`;
}

export function createComplianceEntityId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

const requirementTemplates: Partial<Record<string, ComplianceRequirementTemplate[]>> = {
  VERL: [
    { name: 'E-keurmerk verlichtingsunit (typegoedkeuring)', regulation: 'ECE R148/R149/R150', mandatory: true, notes: 'Controleer E-markering en certificaat voor gebruik op de openbare weg.' },
    { name: 'EMC-verklaring (bij LED-driver/elektronica)', regulation: 'ECE R10', mandatory: false, notes: 'Relevant voor LED-units met elektronica of driver.' },
  ],
  REMBLK: [
    { name: 'Typegoedkeuring vervangingsremblokken (E-markering)', regulation: 'ECE R90', mandatory: true, notes: 'Vraag certificaat op en controleer markering op product en verpakking.' },
  ],
  REMSCH: [
    { name: 'Typegoedkeuring vervangingsremschijven (E-markering)', regulation: 'ECE R90', mandatory: true, notes: 'Sinds R90-02 ook relevant voor vervangingsremschijven.' },
  ],
  SPIEG: [
    { name: 'Typegoedkeuring spiegels (E-markering)', regulation: 'ECE R81', mandatory: true, notes: 'Spiegels voor brom- en motorfietsen moeten E-gemarkeerd zijn.' },
  ],
  ECU: [
    { name: 'EMC-goedkeuring elektronische regeleenheid', regulation: 'ECE R10', mandatory: true, notes: 'Elektronische componenten die voertuigwerking beïnvloeden moeten EMC-conform zijn.' },
  ],
  BOB: [
    { name: 'EMC-verklaring ontstekingscomponent', regulation: 'ECE R10', mandatory: false, notes: 'Vraag een EMC-verklaring of testrapport op bij de fabrikant.' },
  ],
  START: [
    { name: 'EMC-verklaring startmotor', regulation: 'ECE R10', mandatory: false, notes: 'Vraag een EMC-verklaring of testrapport op bij de fabrikant.' },
  ],
  ACCU: [
    { name: 'CE-conformiteit batterij', regulation: 'Batterijverordening (EU) 2023/1542', mandatory: true, notes: 'Batterijen moeten CE-gemarkeerd zijn met EU-conformiteitsverklaring.' },
    { name: 'UN 38.3 transporttestrapport (lithium)', regulation: 'UN Handboek deel III, 38.3', mandatory: false, notes: 'Voor lithium-accu’s belangrijk voor transport en importcontrole.' },
  ],
};

const testPlanTemplates: Partial<Record<string, ComplianceTestPlanTemplate[]>> = {
  WIND: [
    { name: 'Ingangscontrole zending', method: 'Visuele controle op transportschade, krassen, scheuren en compleetheid.', frequency: 'Elke zending', mandatory: true },
    { name: 'Pasvorm-/montagetest', method: 'Proefmontage op doelmodel: uitlijning en bevestiging controleren.', frequency: 'Eenmalig per type/leverancier', mandatory: false },
  ],
  STUUR: [
    { name: 'Ingangscontrole zending', method: 'Controle op deuken, scheuren, lasnaden en corrosie.', frequency: 'Elke zending', mandatory: true },
    { name: 'Pasvorm-/montagetest', method: 'Proefmontage: klemming, uitlijning en vrije kabelloop controleren.', frequency: 'Eenmalig per type/leverancier', mandatory: true },
  ],
  CYL: [
    { name: 'Ingangscontrole zending', method: 'Controle op gietfouten, schade en compleetheid van de set.', frequency: 'Elke zending', mandatory: true },
    { name: 'Maatcontrole boring', method: 'Steekproef: boringdiameter meten en vergelijken met specificatie.', frequency: 'Steekproef per zending', mandatory: false },
  ],
  ZUIS: [
    { name: 'Ingangscontrole zending', method: 'Controle op transportschade, gietfouten en compleetheid.', frequency: 'Elke zending', mandatory: true },
    { name: 'Maatcontrole diameter', method: 'Steekproef: zuigerdiameter meten en vergelijken met specificatie.', frequency: 'Steekproef per zending', mandatory: false },
  ],
  VAR: [
    { name: 'Gewichtscontrole rollen', method: 'Steekproef: rollen wegen en set onderling controleren.', frequency: 'Steekproef per zending', mandatory: true },
    { name: 'Ingangscontrole zending', method: 'Visuele controle op vervorming, bramen en beschadiging.', frequency: 'Elke zending', mandatory: false },
  ],
  VSNA: [
    { name: 'Ingangscontrole zending', method: 'Controle op scheuren, rafels en maataanduiding.', frequency: 'Elke zending', mandatory: true },
    { name: 'Maatcontrole', method: 'Steekproef: lengte, breedte en hoek meten tegen specificatie.', frequency: 'Steekproef per zending', mandatory: false },
  ],
  REMBLK: [
    { name: 'Controle R90-markering', method: 'Controleer E-/R90-goedkeuringsnummer op product en verpakking.', frequency: 'Elke zending', mandatory: true },
    { name: 'Ingangscontrole en maatcontrole', method: 'Visuele controle en steekproef maatcontrole.', frequency: 'Elke zending', mandatory: true },
  ],
  REMSCH: [
    { name: 'Controle R90-/E-markering', method: 'Goedkeuringsmarkering op schijf controleren en matchen met certificaat.', frequency: 'Elke zending', mandatory: true },
    { name: 'Maatcontrole dikte en slag', method: 'Steekproef: dikte meten en slag controleren.', frequency: 'Steekproef per zending', mandatory: false },
  ],
  BOB: [
    { name: 'Elektrische functietest', method: 'Steekproef: weerstandsmeting en werkingstest op testvoertuig.', frequency: 'Steekproef per zending', mandatory: true },
  ],
  ECU: [
    { name: 'Functietest op testvoertuig', method: 'Werkingstest: starten, stationair en gasrespons controleren.', frequency: 'Eenmalig per type/leverancier', mandatory: true },
    { name: 'Controle E-markering', method: 'ECE R10 markering op de unit controleren.', frequency: 'Elke zending', mandatory: false },
  ],
  SPIEG: [
    { name: 'Controle E-markering', method: 'E-keurmerk op spiegelglas of huis controleren.', frequency: 'Elke zending', mandatory: true },
    { name: 'Bevestigings-/pasvormtest', method: 'Steekproef: montage en klemming op doelmodel controleren.', frequency: 'Eenmalig per type/leverancier', mandatory: false },
  ],
  KAB: [
    { name: 'Functietest', method: 'Steekproef: soepele werking en lengtecontrole tegen specificatie.', frequency: 'Steekproef per zending', mandatory: true },
  ],
  VERL: [
    { name: 'Controle E-keurmerk op unit', method: 'E-nummer op unit controleren en matchen met certificaat.', frequency: 'Elke zending', mandatory: true },
    { name: 'Elektrische functietest', method: 'Steekproef: aansluiten op 12V en functies testen.', frequency: 'Steekproef per zending', mandatory: true },
  ],
  ACCU: [
    { name: 'Spanningsmeting bij ontvangst', method: 'Rustspanning meten; controle op lekkage en bolling.', frequency: 'Elke zending', mandatory: true },
    { name: 'Controle CE-markering en etikettering', method: 'CE-markering, capaciteit en veiligheidspictogrammen controleren.', frequency: 'Elke zending', mandatory: false },
  ],
  START: [
    { name: 'Elektrische functietest', method: 'Steekproef: stroomopname en werking testen op testbank of voertuig.', frequency: 'Steekproef per zending', mandatory: false },
  ],
};

function genericTestPlan(family: ComplianceProductFamily): ComplianceTestPlanTemplate[] {
  const highRisk = family.riskLevel === 'high' || family.riskLevel === 'critical';
  return [
    {
      name: 'Ingangscontrole zending',
      method: 'Visuele controle op transportschade, compleetheid en zichtbare gebreken.',
      frequency: 'Elke zending',
      mandatory: highRisk,
    },
    {
      name: 'Pasvorm-/functietest',
      method: 'Steekproef: pasvorm of werking controleren op doelmodel.',
      frequency: 'Eenmalig per type/leverancier',
      mandatory: false,
    },
  ];
}

export const complianceTemplates: ComplianceTemplate[] = [
  {
    code: 'WIND',
    name: 'Windschermen',
    category: 'Carrosserie',
    description: 'Windschermen voor scooters en bromfietsen van polycarbonaat of PMMA.',
    intendedUse: 'Montage op compatibele scooters als windafscherming voor de berijder.',
    foreseeableMisuse: 'Montage op niet-compatibele voertuigen of gebruik bij zichtbare schade.',
    riskLevel: 'low',
    keywords: ['windscherm', 'windscherm', 'wind screen'],
    risks: [
      {
        hazard: 'Losraken tijdens rijden',
        riskDescription: 'Onjuiste montage kan leiden tot losraken bij snelheid.',
        severity: '4',
        probability: '2',
        mitigation: 'Montage-instructie en controle van bevestigingspunten opnemen.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Controleer alle bevestigingspunten voor gebruik. Niet gebruiken bij barsten of scheuren.',
        warningTextEn: 'Check all mounting points before use. Do not use if cracked or damaged.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'STUUR',
    name: 'Sturen',
    category: 'Stuur & Remmen',
    description: 'Vervangende en upgrade sturen voor scooters en bromfietsen.',
    intendedUse: 'Vervanging of upgrade van een compatibel stuur op een scooter of bromfiets.',
    foreseeableMisuse: 'Gebruik op niet-compatibele voertuigen of modificaties door boren/lassen.',
    riskLevel: 'high',
    keywords: ['stuur', 'handlebar'],
    risks: [
      {
        hazard: 'Verlies van besturing',
        riskDescription: 'Breuk of verkeerde montage kan leiden tot verlies van controle.',
        severity: '5',
        probability: '2',
        mitigation: 'Alleen compatibele sturen leveren met duidelijke montage-eisen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Veiligheidsonderdeel: laat montage uitvoeren door een gekwalificeerde monteur.',
        warningTextEn: 'Safety part: have installation carried out by a qualified mechanic.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'CYL',
    name: 'Cilinders',
    category: 'Motor',
    description: 'Vervangende en performance cilinders voor scooterblokken.',
    intendedUse: 'Vervanging van defecte cilinders of prestatieverbetering binnen wettelijke grenzen.',
    foreseeableMisuse: 'Gebruik zonder juiste afstelling of boven wettelijk toegestane limieten.',
    riskLevel: 'medium',
    keywords: ['cilinder', 'cylinder'],
    risks: [
      {
        hazard: 'Motorschade',
        riskDescription: 'Verkeerde afstelling of montage kan ernstige motorschade veroorzaken.',
        severity: '3',
        probability: '3',
        mitigation: 'Afstel- en montage-instructies meeleveren.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'general',
        warningTextNl: 'Controleer na montage de brandstofmix en afstelling. Opgevoerde cilinders kunnen typegoedkeuring beïnvloeden.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'ZUIS',
    name: 'Zuigers',
    category: 'Motor',
    description: 'Vervangende zuigers met zuigerringen voor scooterblokken.',
    intendedUse: 'Vervanging van versleten of beschadigde zuigers in compatibele motoren.',
    foreseeableMisuse: 'Montage zonder correcte speling of met gebruikte zuigerringen.',
    riskLevel: 'medium',
    keywords: ['zuiger', 'piston'],
    risks: [
      {
        hazard: 'Vastlopen motor',
        riskDescription: 'Verkeerde passing kan leiden tot vastlopen van de zuiger.',
        severity: '4',
        probability: '2',
        mitigation: 'Speling meten en montage-instructie verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Meet altijd de cilinderboring en gebruik nieuwe zuigerringen.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'VAR',
    name: 'Variorollen',
    category: 'Aandrijving',
    description: 'Variorollen voor de CVT-transmissie van scooters.',
    intendedUse: 'Vervanging van versleten rollen met een passend gewicht voor het model.',
    foreseeableMisuse: 'Mengen van gewichten of gebruik van niet-compatibele rolmaten.',
    riskLevel: 'low',
    keywords: ['variorol', 'roller', '19x15.5', '16x13'],
    risks: [
      {
        hazard: 'Onjuist schakelgedrag',
        riskDescription: 'Verkeerd gewicht geeft slecht acceleratie- en toerentalgedrag.',
        severity: '2',
        probability: '3',
        mitigation: 'Duidelijke gewichtsspecificatie per voertuig opnemen.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Vervang altijd alle rollen tegelijk als complete set.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'VSNA',
    name: 'V-snaren',
    category: 'Aandrijving',
    description: 'CVT-riemen voor scooter transmissies.',
    intendedUse: 'Vervanging van versleten of beschadigde CVT-riemen.',
    foreseeableMisuse: 'Gebruik van een verkeerde maat of te lang doorrijden met slijtage.',
    riskLevel: 'medium',
    keywords: ['v-snaar', 'v snaar', 'belt', 'riem'],
    risks: [
      {
        hazard: 'Breuk van aandrijving',
        riskDescription: 'Een defecte riem zorgt voor plots verlies van aandrijving.',
        severity: '3',
        probability: '2',
        mitigation: 'Vervangingsinterval en inspectiecriteria vermelden.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'general',
        warningTextNl: 'Vervang de V-snaar tijdig en direct bij zichtbare slijtage of scheuren.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'REMBLK',
    name: 'Remblokken',
    category: 'Remmen',
    description: 'Remblokken voor trommel- en schijfremsystemen.',
    intendedUse: 'Vervanging van versleten remblokken op compatibele scooters.',
    foreseeableMisuse: 'Gebruik voorbij slijtagegrens of montage zonder controle van schijf/trommel.',
    riskLevel: 'high',
    keywords: ['remblok', 'brake pad'],
    risks: [
      {
        hazard: 'Onvoldoende remwerking',
        riskDescription: 'Verkeerde of versleten blokken verminderen de remprestatie.',
        severity: '5',
        probability: '2',
        mitigation: 'Slijtagegrens en inremprocedure duidelijk communiceren.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Veiligheidsonderdeel: controleer de remwerking direct na montage.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'REMSCH',
    name: 'Remschijven',
    category: 'Remmen',
    description: 'Remschijven voor scooters met schijfremmen.',
    intendedUse: 'Vervanging van versleten of beschadigde remschijven.',
    foreseeableMisuse: 'Gebruik onder minimale dikte of zonder nieuwe remblokken.',
    riskLevel: 'high',
    keywords: ['remschijf', 'brake disc'],
    risks: [
      {
        hazard: 'Barst of breuk',
        riskDescription: 'Beschadigde schijven kunnen barsten onder rembelasting.',
        severity: '5',
        probability: '1',
        mitigation: 'Minimale dikte en montagevereisten documenteren.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Vervang remschijven altijd samen met passende nieuwe remblokken.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'BOB',
    name: 'Bobines / Ontstekingsspoelen',
    category: 'Elektrisch',
    description: 'Ontstekingsspoelen die laagspanning omzetten naar hoogspanning voor de bougie.',
    intendedUse: 'Vervanging van defecte ontstekingscomponenten op compatibele voertuigen.',
    foreseeableMisuse: 'Aanraken van hoogspanning of montage zonder juiste massa/aansluiting.',
    riskLevel: 'medium',
    keywords: ['bobine', 'ontstekingsspoel', 'ignition coil'],
    risks: [
      {
        hazard: 'Elektrische schok',
        riskDescription: 'Hoogspanning aan secundaire zijde kan letsel veroorzaken.',
        severity: '4',
        probability: '2',
        mitigation: 'Waarschuwing en isolatie-eisen op documentatie zetten.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'electrical',
        warningTextNl: 'Hoogspanning: raak kabel of bougiedop nooit aan terwijl de motor draait.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'ECU',
    name: 'ECU / CDI',
    category: 'Elektrisch',
    description: 'Elektronische regeleenheden voor ontsteking en/of injectie.',
    intendedUse: 'Vervanging van defecte ECU/CDI units voor specifieke voertuigen.',
    foreseeableMisuse: 'Gebruik van race-uitvoeringen op de openbare weg.',
    riskLevel: 'medium',
    keywords: ['ecu', 'cdi', 'controller'],
    risks: [
      {
        hazard: 'Onbedoelde opvoering',
        riskDescription: 'Niet-goedgekeurde units kunnen begrenzers uitschakelen.',
        severity: '3',
        probability: '3',
        mitigation: 'Variant en wegtoelating duidelijk vermelden.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'general',
        warningTextNl: 'Controleer of deze ECU/CDI is toegestaan voor gebruik op de openbare weg.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'KAP',
    name: 'Kappen / Carrosserie',
    category: 'Carrosserie',
    description: 'Kunststof buitenpanelen en carrosserieonderdelen voor scooters.',
    intendedUse: 'Vervanging van beschadigde carrosseriedelen op compatibele modellen.',
    foreseeableMisuse: 'Montage zonder juiste clips of op verkeerde modellen.',
    riskLevel: 'low',
    keywords: ['kap', 'panelen', 'beenschild', 'spatbord'],
    risks: [
      {
        hazard: 'Losraken in verkeer',
        riskDescription: 'Niet goed bevestigde kappen kunnen loskomen.',
        severity: '3',
        probability: '2',
        mitigation: 'Volledige bevestigingsset en montagecontrole voorschrijven.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Controleer alle clips en schroeven voor gebruik op de weg.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'SPIEG',
    name: 'Spiegels',
    category: 'Veiligheid & Verlichting',
    description: 'Buitenspiegels voor scooters en bromfietsen.',
    intendedUse: 'Vervanging of toevoeging van een spiegel voor achteruitzicht.',
    foreseeableMisuse: 'Gebruik van spiegels zonder voldoende zichtveld.',
    riskLevel: 'medium',
    keywords: ['spiegel', 'mirror'],
    risks: [
      {
        hazard: 'Onvoldoende zicht',
        riskDescription: 'Verkeerd afgestelde of te kleine spiegels beperken het zicht naar achteren.',
        severity: '3',
        probability: '2',
        mitigation: 'ECE-zichtveld en montage-instructie vermelden.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'general',
        warningTextNl: 'Controleer na montage de zichthoek en wettelijke eisen voor achteruitzicht.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'KAB',
    name: 'Kabels (Bowdenkabels)',
    category: 'Stuur & Remmen',
    description: 'Bowdenkabels voor gas, rem, choke en koppeling.',
    intendedUse: 'Vervanging van versleten of beschadigde bedieningskabels.',
    foreseeableMisuse: 'Gebruik van verkeerde lengte of knikbelasting.',
    riskLevel: 'high',
    keywords: ['kabel', 'bowdenkabel', 'throttle cable', 'brake cable'],
    risks: [
      {
        hazard: 'Functieverlies',
        riskDescription: 'Gebroken kabel kan gas of remwerking doen uitvallen.',
        severity: '5',
        probability: '2',
        mitigation: 'Volledige slag en inspectie na montage verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Veiligheidsonderdeel: controleer na montage volledige vrije slag en correcte werking.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'VERL',
    name: 'Verlichting',
    category: 'Veiligheid & Verlichting',
    description: 'Koplampen, achterlichten, richtingaanwijzers en LED-verlichting.',
    intendedUse: 'Vervanging of upgrade van scooterverlichting met geldige typegoedkeuring.',
    foreseeableMisuse: 'Gebruik van niet-typegoedgekeurde verlichting op de openbare weg.',
    riskLevel: 'medium',
    keywords: ['lamp', 'verlichting', 'koplamp', 'achterlicht', 'knipperlicht', 'led'],
    risks: [
      {
        hazard: 'Elektrische overbelasting',
        riskDescription: 'Verkeerde spanning of montage kan brand of storingen veroorzaken.',
        severity: '4',
        probability: '2',
        mitigation: 'Spanning, zekering en goedkeuringsnummer documenteren.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'general',
        warningTextNl: 'Gebruik uitsluitend verlichting met geldige typegoedkeuring voor gebruik op de openbare weg.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'ACCU',
    name: "Accu's",
    category: 'Elektrisch',
    description: "Scooteraccu's op basis van loodzuur, AGM, GEL of lithium.",
    intendedUse: 'Vervanging van defecte startaccu of stroomvoorziening voor compatibele scooters.',
    foreseeableMisuse: 'Overladen, kortsluiting of onjuiste afvalverwerking.',
    riskLevel: 'high',
    keywords: ['accu', 'battery', 'lifepo4', 'agm', 'gel'],
    risks: [
      {
        hazard: 'Brand of lekkage',
        riskDescription: 'Beschadigde of verkeerd geladen accu kan branden of chemisch lekken.',
        severity: '5',
        probability: '1',
        mitigation: 'Laadinstructies en inzamelverplichting verplicht communiceren.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'chemical',
        warningTextNl: 'Gevaarlijke stof: lever accu in bij een erkend inzamelpunt en houd buiten bereik van kinderen.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'START',
    name: 'Startmotoren',
    category: 'Elektrisch',
    description: 'Elektrische startmotoren voor scooters en bromfietsen.',
    intendedUse: 'Vervanging van defecte startmotoren.',
    foreseeableMisuse: 'Te lange startpogingen of gebruik bij verkeerde spanning.',
    riskLevel: 'medium',
    keywords: ['startmotor', 'starter motor'],
    risks: [
      {
        hazard: 'Oververhitting',
        riskDescription: 'Langdurig starten kan de startmotor thermisch overbelasten.',
        severity: '3',
        probability: '2',
        mitigation: 'Maximale inschakelduur in handleiding opnemen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'electrical',
        warningTextNl: 'Gebruik de startmotor niet langer dan 5 seconden achter elkaar.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'SPRUIT',
    name: 'Spruitstukken',
    category: 'Motor',
    description: 'Inlaat- en uitlaatspruitstukken voor scooterblokken.',
    intendedUse: 'Vervanging van defecte of versleten spruitstukken.',
    foreseeableMisuse: 'Montage zonder pakking of met verkeerde diameter.',
    riskLevel: 'medium',
    keywords: ['spruitstuk', 'inlaat', 'uitlaatflens', 'manifold'],
    risks: [
      {
        hazard: 'Lekkage',
        riskDescription: 'Brandstof- of uitlaatgaslekkage kan ontstaan door slechte montage.',
        severity: '4',
        probability: '2',
        mitigation: 'Nieuwe pakkingen en naloopcontrole verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Gebruik altijd een nieuwe pakking en controleer na de eerste rit op lekkage.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'SCHOK',
    name: 'Schokdempers',
    category: 'Ophanging',
    description: 'Vervangende schokdempers voor voor- en achtervering van scooters en bromfietsen.',
    intendedUse: 'Vervanging van versleten of defecte schokdempers voor herstel van rijcomfort en wegligging.',
    foreseeableMisuse: 'Gebruik van niet-passende schokdempers of rijden met lekkende of kromme dempers.',
    riskLevel: 'high',
    keywords: ['schokdemper', 'veerpoot', 'rear shock', 'fork shock'],
    risks: [
      {
        hazard: 'Instabiel rijgedrag',
        riskDescription: 'Versleten of onjuist gemonteerde schokdempers verminderen stabiliteit en remcontrole.',
        severity: '5',
        probability: '2',
        mitigation: 'Alleen passende dempers leveren en montagecontrole voorschrijven.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Veiligheidsonderdeel: controleer na montage direct de stabiliteit, vrije slag en bevestiging.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'KABOOM',
    name: 'Kabelbomen',
    category: 'Elektrisch',
    description: 'Complete kabelbomen met connectors en zekeringhouders voor scooters en bromfietsen.',
    intendedUse: 'Vervanging van beschadigde of doorgebrande voertuigbedrading.',
    foreseeableMisuse: 'Montage zonder elektrisch schema of met onjuiste connectoren en zekeringen.',
    riskLevel: 'high',
    keywords: ['kabelboom', 'wiring harness', 'loom'],
    risks: [
      {
        hazard: 'Kortsluiting of uitval',
        riskDescription: 'Verkeerd aangesloten bedrading kan kortsluiting of uitval van voertuigfuncties veroorzaken.',
        severity: '5',
        probability: '2',
        mitigation: 'Schema en aansluitcontrole verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'electrical',
        warningTextNl: 'Koppel de accu los en volg het juiste elektrisch schema voordat de kabelboom wordt aangesloten.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'LAG',
    name: 'Lagers',
    category: 'Transmissie',
    description: 'Kogellagers, naaldlagers en rollagers voor wielen, stuur, variomatiek en motoren.',
    intendedUse: 'Vervanging van versleten of beschadigde lagers voor soepele rotatie met minimale wrijving.',
    foreseeableMisuse: 'Hergebruik van verwijderde lagers of montage zonder juiste passing en smering.',
    riskLevel: 'high',
    keywords: ['lager', 'bearing', 'kogellager', 'naaldlager'],
    risks: [
      {
        hazard: 'Blokkeren of speling',
        riskDescription: 'Defecte lagers kunnen blokkeren of gevaarlijke speling veroorzaken.',
        severity: '5',
        probability: '2',
        mitigation: 'Juiste passing en inspectie na montage verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'general',
        warningTextNl: 'Vervang beschadigde of ruw lopende lagers direct en hergebruik nooit een verwijderd lager.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'AFDICHT',
    name: 'Afdichtingen & Keerringen',
    category: 'Transmissie',
    description: 'Olie-afdichtingen, keerringen, O-ringen en stofkappen voor scooters en bromfietsen.',
    intendedUse: 'Vervanging van versleten afdichtingen om lekkage van olie, vet of vloeistoffen te voorkomen.',
    foreseeableMisuse: 'Montage met beschadigde asvlakken of zonder correcte inbouwrichting.',
    riskLevel: 'medium',
    keywords: ['keerring', 'afdichting', 'seal', 'o-ring'],
    risks: [
      {
        hazard: 'Lekkage',
        riskDescription: 'Slechte afdichting leidt tot verlies van smering of vervuiling van andere onderdelen.',
        severity: '4',
        probability: '2',
        mitigation: 'Nieuwe afdichtingen en lekcontrole na montage voorschrijven.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Gebruik altijd een nieuwe afdichting en controleer na montage op lekkage.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'ZADEL',
    name: 'Zadels & Buddyseats',
    category: 'Carrosserie',
    description: 'Vervangende zadels, buddyseats en zitbankjes voor scooters en bromfietsen.',
    intendedUse: 'Vervanging van een beschadigd of versleten zadel voor veilig zitcomfort van bestuurder en passagier.',
    foreseeableMisuse: 'Montage zonder correcte vergrendeling of gebruik met gebroken zadelbasis.',
    riskLevel: 'medium',
    keywords: ['zadel', 'buddyseat', 'seat'],
    risks: [
      {
        hazard: 'Losraken tijdens rijden',
        riskDescription: 'Een slecht vergrendeld zadel kan openklappen of verschuiven tijdens gebruik.',
        severity: '4',
        probability: '2',
        mitigation: 'Vergrendelingscontrole na montage voorschrijven.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Controleer voor gebruik of het zadel volledig vergrendeld is in het slotmechanisme.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'LUCHT',
    name: 'Luchtfilters',
    category: 'Motor',
    description: 'Vervangende luchtfilters met papier-, schuim- of katoenfilterelement voor scooters.',
    intendedUse: 'Vervanging van het luchtfilter op interval om een schone luchttoevoer naar de motor te garanderen.',
    foreseeableMisuse: 'Gebruik van een vervuild of verkeerd filter waardoor het mengsel en motorvermogen verslechteren.',
    riskLevel: 'low',
    keywords: ['luchtfilter', 'air filter'],
    risks: [
      {
        hazard: 'Verminderde motorprestatie',
        riskDescription: 'Een verkeerd of vervuild luchtfilter kan een te rijk of te arm mengsel veroorzaken.',
        severity: '2',
        probability: '3',
        mitigation: 'Onderhoudsinterval en juiste passing communiceren.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'maintenance',
        warningTextNl: 'Vervang of reinig het luchtfilter op tijd volgens onderhoudsinterval en gebruik alleen passende filters.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'KLAU',
    name: 'Remklauwen',
    category: 'Remmen',
    description: 'Remklauwen voor schijfremsystemen van scooters en bromfietsen.',
    intendedUse: 'Vervanging van defecte, lekkende of gecorrodeerde remklauwen als veiligheidsonderdeel.',
    foreseeableMisuse: 'Montage zonder ontluchten of met beschadigde remleiding of afdichtingen.',
    riskLevel: 'high',
    keywords: ['remklauw', 'brake caliper', 'caliper'],
    risks: [
      {
        hazard: 'Remfalen',
        riskDescription: 'Een defecte of verkeerd gemonteerde remklauw kan direct leiden tot verlies van remwerking.',
        severity: '5',
        probability: '2',
        mitigation: 'Ontluchten en functietest na montage verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Veiligheidsonderdeel: ontlucht het remsysteem volledig en test de remwerking direct na montage.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'STAND',
    name: 'Standaarden (zij- en middenstandaard)',
    category: 'Frame',
    description: 'Zijstandaarden en middenstandaarden voor scooters en bromfietsen.',
    intendedUse: 'Vervanging van beschadigde of versleten parkeerstandaarden voor stabiel parkeren.',
    foreseeableMisuse: 'Gebruik met versleten veer of montage waardoor de standaard tijdens rijden niet goed inklapt.',
    riskLevel: 'medium',
    keywords: ['standaard', 'zijstandaard', 'middenstandaard', 'kickstand'],
    risks: [
      {
        hazard: 'Contact met wegdek',
        riskDescription: 'Een slecht inklappende standaard kan tijdens het rijden het wegdek raken.',
        severity: '4',
        probability: '2',
        mitigation: 'Vrije beweging en veerspanning controleren na montage.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'inspection',
        warningTextNl: 'Controleer of de standaard na montage volledig inklapt en stevig vergrendeld blijft tijdens rijden.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'HITTE',
    name: 'Hitteschermen',
    category: 'Uitlaat',
    description: 'Hitteschermen en uitlaatbeschermers ter bescherming tegen hete uitlaatdelen.',
    intendedUse: 'Bescherming van berijder en omliggende onderdelen tegen uitlaathitte.',
    foreseeableMisuse: 'Gebruik zonder alle bevestigingspunten of met contact tegen bewegende of smeltbare delen.',
    riskLevel: 'medium',
    keywords: ['hitteschild', 'hittescherm', 'heat shield'],
    risks: [
      {
        hazard: 'Brandwonden of smeltschade',
        riskDescription: 'Ontbrekende of loszittende hitteschermen vergroten risico op aanraking of warmteschade.',
        severity: '3',
        probability: '2',
        mitigation: 'Bevestigingscontrole en afstand tot hete delen voorschrijven.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'general',
        warningTextNl: 'Controleer na montage of het hittescherm stevig vastzit en niet tegen hete of bewegende delen schuurt.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'KICK',
    name: 'Kickstartpedalen & Onderdelen',
    category: 'Motor',
    description: 'Kickstartpedalen en onderdelen van het kickstartmechanisme voor scooters en bromfietsen.',
    intendedUse: 'Vervanging van beschadigde kickstartarmen of mechaniek voor handmatig starten van de motor.',
    foreseeableMisuse: 'Gebruik van verbogen of loszittende kickstartdelen of montage zonder correcte terugloop.',
    riskLevel: 'medium',
    keywords: ['kickstart', 'kickstarter', 'starter pedal'],
    risks: [
      {
        hazard: 'Terugslaan of afbreken',
        riskDescription: 'Een defect kickstartmechanisme kan plots doorslaan of afbreken tijdens gebruik.',
        severity: '3',
        probability: '2',
        mitigation: 'Mechanische controle en vrije terugloop na montage verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Controleer na montage de vrije beweging en terugloop van het kickstartmechanisme voordat de scooter wordt gestart.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'BEEN',
    name: 'Beenschermen (Leg Shields)',
    category: 'Carrosserie',
    description: 'Beenschermen voor scooters en bromfietsen die berijder beschermen tegen wind, regen en vuil.',
    intendedUse: 'Vervanging van een beschadigd beenscherm als carrosserie- en beschermingsonderdeel.',
    foreseeableMisuse: 'Montage op verkeerde modellen of zonder complete bevestiging waardoor losraken ontstaat.',
    riskLevel: 'low',
    keywords: ['beenscherm', 'leg shield'],
    risks: [
      {
        hazard: 'Losraken paneel',
        riskDescription: 'Een slecht gemonteerd beenscherm kan tijdens het rijden loskomen.',
        severity: '3',
        probability: '2',
        mitigation: 'Alle bevestigingspunten en pasvorm controleren na montage.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Controleer voor gebruik alle clips, schroeven en pasvorm van het beenscherm.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'KENT',
    name: 'Kentekenplaathouders',
    category: 'Frame',
    description: 'Kentekenplaathouders en nummerplaatbeugels voor scooters en bromfietsen.',
    intendedUse: 'Vervanging van een beschadigde kentekenplaathouder voor zichtbare en correcte kentekenmontage.',
    foreseeableMisuse: 'Montage waardoor kenteken slecht leesbaar is of houder losraakt tijdens rijden.',
    riskLevel: 'low',
    keywords: ['kentekenplaat', 'nummerplaathouder', 'plate bracket'],
    risks: [
      {
        hazard: 'Verlies van kentekenplaat',
        riskDescription: 'Een slecht gemonteerde houder kan kentekenplaat of verlichting verliezen.',
        severity: '2',
        probability: '2',
        mitigation: 'Bevestiging en zichtbaarheid conform wettelijke eisen controleren.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'legal',
        warningTextNl: 'Controleer na montage of de kentekenplaat stevig vastzit en volledig leesbaar blijft volgens de wettelijke eisen.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'TOP',
    name: 'Topsets (Cilinder + Zuiger kits)',
    category: 'Motor',
    description: 'Complete topsets met cilinder, zuiger en zuigerringen voor scooterrevisie of prestatie-upgrade.',
    intendedUse: 'Vervanging of revisie van bovenmotoronderdelen als complete set.',
    foreseeableMisuse: 'Montage zonder juiste afstelling of gebruik boven wettelijk toegestane limieten.',
    riskLevel: 'medium',
    keywords: ['topset', 'cylinder kit', 'zuiger kit'],
    risks: [
      {
        hazard: 'Motorschade',
        riskDescription: 'Verkeerd ingemeten of afgestelde topsets kunnen ernstige motorschade veroorzaken.',
        severity: '4',
        probability: '2',
        mitigation: 'Complete montage- en afstelinstructies meeleveren.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Monteer topsets alleen met nieuwe pakkingen en controleer afstelling en compressie na montage.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'PAK',
    name: 'Pakkingen',
    category: 'Motor',
    description: 'Motorpakkingen voor cilinder, uitlaat, deksels en carburateurverbindingen.',
    intendedUse: 'Afdichting van verbindingen in motorsystemen bij revisie of vervanging van onderdelen.',
    foreseeableMisuse: 'Hergebruik van oude pakkingen of montage op vervuilde of vervormde oppervlakken.',
    riskLevel: 'medium',
    keywords: ['pakking', 'gasket'],
    risks: [
      {
        hazard: 'Lekkage van olie, brandstof of gassen',
        riskDescription: 'Slecht afdichtende pakkingen kunnen lekkage en vervolgschade veroorzaken.',
        severity: '4',
        probability: '2',
        mitigation: 'Nieuwe pakking en nacontrole na opwarmen verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Gebruik nooit een oude pakking opnieuw en controleer na de eerste warme rit op lekkage.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'SCHAK',
    name: 'Schakelaars & Bedieningselementen',
    category: 'Elektrisch',
    description: 'Stuurschakelaars, lichtknoppen, richtingaanwijzerschakelaars en startschakelaars.',
    intendedUse: 'Vervanging van defecte of beschadigde bedieningsschakelaars op het stuur.',
    foreseeableMisuse: 'Gebruik van schakelaars met verkeerde elektrische specificaties of foutieve aansluiting.',
    riskLevel: 'low',
    keywords: ['schakelaar', 'lichtknop', 'switchgear', 'bediening'],
    risks: [
      {
        hazard: 'Uitval van voertuigfuncties',
        riskDescription: 'Defecte of verkeerd aangesloten schakelaars kunnen verlichting of startfunctie uitschakelen.',
        severity: '3',
        probability: '2',
        mitigation: 'Functietest na montage verplicht stellen.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'electrical',
        warningTextNl: 'Test na montage alle functies van de schakelaar voor gebruik op de openbare weg.',
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'CARB',
    name: 'Carburateuronderdelen & Sproeiers',
    category: 'Motor',
    description: 'Hoofdsproeiers, stationairsproeiers, naalden, membranen en andere carburateuronderdelen.',
    intendedUse: 'Vervanging van versleten of verstopte carburateuronderdelen voor correcte brandstofmenging.',
    foreseeableMisuse: 'Gebruik van een verkeerde sproeiermaat of rijden met lekkende carburateuronderdelen.',
    riskLevel: 'medium',
    keywords: ['carburateur', 'sproeier', 'jet', 'carb'],
    risks: [
      {
        hazard: 'Brandstoflekkage of verkeerd mengsel',
        riskDescription: 'Foute onderdelen of montage kunnen lekkage of onjuiste verbranding veroorzaken.',
        severity: '4',
        probability: '2',
        mitigation: 'Maatvoering en lekcontrole na montage verplicht stellen.',
        residualRisk: '2',
      },
    ],
    warnings: [
      {
        warningType: 'fire',
        warningTextNl: 'Werk nooit aan carburateuronderdelen in de buurt van open vuur en controleer na montage op lekkage.',
        requiredOnLabel: true,
        requiredInManual: true,
      },
    ],
  },
  {
    code: 'BODYKIT',
    name: 'Carrosserie sets (Body kits)',
    category: 'Carrosserie',
    description: 'Complete carrosseriesets met meerdere bijpassende bodypanelen voor scooters.',
    intendedUse: 'Volledige carrosserievervanging of esthetische upgrade als complete set.',
    foreseeableMisuse: 'Combineren met niet-passende panelen of montage zonder volledige bevestigingsset.',
    riskLevel: 'low',
    keywords: ['bodykit', 'carrosserie set', 'panelen set'],
    risks: [
      {
        hazard: 'Losraken van panelen',
        riskDescription: 'Meerdere onjuist gemonteerde panelen kunnen loskomen en een verkeersgevaar vormen.',
        severity: '3',
        probability: '2',
        mitigation: 'Montagevolgorde en systematische bevestigingscontrole voorschrijven.',
        residualRisk: '1',
      },
    ],
    warnings: [
      {
        warningType: 'installation',
        warningTextNl: 'Controleer na montage alle panelen systematisch op pasvorm en vergrendeling voordat het voertuig wordt gebruikt.',
        requiredInManual: true,
      },
    ],
  },
];

export function buildComplianceTemplateSeed() {
  const families: ComplianceProductFamily[] = complianceTemplates.map((template) => ({
    id: familyIdForCode(template.code),
    code: template.code,
    name: template.name,
    category: template.category,
    description: template.description,
    intendedUse: template.intendedUse,
    foreseeableMisuse: template.foreseeableMisuse,
    riskLevel: template.riskLevel,
    gpsrRequired: true,
    noWarningsNeeded: false,
    manualText: '',
    manufacturerName: '',
    manufacturerContact: '',
    status: 'concept',
  }));

  const risks: ComplianceFamilyRisk[] = complianceTemplates.flatMap((template) =>
    template.risks.map((risk, index) => ({
      id: riskIdForCode(template.code, index),
      familyId: familyIdForCode(template.code),
      hazard: risk.hazard,
      riskDescription: risk.riskDescription,
      severity: risk.severity,
      probability: risk.probability,
      mitigation: risk.mitigation,
      residualRisk: risk.residualRisk,
    })),
  );

  const warnings: ComplianceFamilyWarning[] = complianceTemplates.flatMap((template) =>
    template.warnings.map((warning, index) => ({
      id: warningIdForCode(template.code, index),
      familyId: familyIdForCode(template.code),
      warningType: warning.warningType,
      warningTextNl: warning.warningTextNl,
      warningTextEn: warning.warningTextEn,
      requiredOnLabel: warning.requiredOnLabel ?? false,
      requiredInManual: warning.requiredInManual ?? true,
    })),
  );

  const requirements: ComplianceFamilyRequirement[] = families.flatMap((family) =>
    (requirementTemplates[family.code] ?? []).map((requirement, index) => ({
      id: requirementIdForCode(family.code, index),
      familyId: family.id,
      name: requirement.name,
      regulation: requirement.regulation,
      mandatory: requirement.mandatory ?? true,
      notes: requirement.notes,
    })),
  );

  const testPlans: ComplianceFamilyTestPlan[] = families.flatMap((family) =>
    (testPlanTemplates[family.code] ?? genericTestPlan(family)).map((testPlan, index) => ({
      id: testPlanIdForCode(family.code, index),
      familyId: family.id,
      name: testPlan.name,
      method: testPlan.method,
      frequency: testPlan.frequency,
      mandatory: testPlan.mandatory ?? true,
    })),
  );

  return {
    families,
    risks,
    warnings,
    documents: [] as ComplianceFamilyDocument[],
    requirements,
    testPlans,
    tests: [] as ComplianceProductTest[],
    revisions: [] as ComplianceFamilyRevision[],
  };
}

export function requirementFulfilled(
  requirement: ComplianceFamilyRequirement,
  documents: ComplianceFamilyDocument[],
) {
  return documents.some((document) =>
    document.familyId === requirement.familyId
    && document.requirementId === requirement.id
    && (document.status ?? 'active') === 'active');
}

export function testPlanFulfilled(
  testPlan: ComplianceFamilyTestPlan,
  tests: ComplianceProductTest[],
) {
  return tests.some((test) => test.planId === testPlan.id && (test.result ?? 'pass') === 'pass');
}

export function getComplianceFamilyStats(
  family: ComplianceProductFamily,
  risks: ComplianceFamilyRisk[],
  warnings: ComplianceFamilyWarning[],
  documents: ComplianceFamilyDocument[],
  requirements: ComplianceFamilyRequirement[],
  testPlans: ComplianceFamilyTestPlan[],
  tests: ComplianceProductTest[],
  links: ComplianceProductLink[],
  products: Product[] = [],
) {
  const familyRisks = risks.filter((item) => item.familyId === family.id);
  const familyWarnings = warnings.filter((item) => item.familyId === family.id);
  const familyDocuments = documents.filter((item) => item.familyId === family.id);
  const activeDocuments = familyDocuments.filter((item) => (item.status ?? 'active') === 'active');
  const familyRequirements = requirements.filter((item) => item.familyId === family.id);
  const mandatoryRequirements = familyRequirements.filter((item) => item.mandatory !== false);
  const openRequirements = mandatoryRequirements.filter((item) => !requirementFulfilled(item, familyDocuments));
  const familyTestPlans = testPlans.filter((item) => item.familyId === family.id);
  const mandatoryTestPlans = familyTestPlans.filter((item) => item.mandatory !== false);
  const openTestPlans = mandatoryTestPlans.filter((item) => !testPlanFulfilled(item, tests));
  const familyTests = tests.filter((item) => item.familyId === family.id);
  const activeLinks = links.filter((item) => item.familyId === family.id && (item.status ?? 'active') === 'active');
  const linkedProducts = activeLinks
    .map((link) => products.find((item) => item.id === link.productId))
    .filter((product): product is Product => Boolean(product));
  const hasLinkedSupplierSource = activeLinks.some((link) => {
    const product = products.find((item) => item.id === link.productId);
    return Boolean(product?.supplier?.trim() || product?.manufacturerName?.trim());
  });

  const checks = [
    { ok: Boolean(family.description?.trim()), label: 'Omschrijving' },
    { ok: Boolean(family.intendedUse?.trim()), label: 'Bedoeld gebruik' },
    { ok: Boolean(family.foreseeableMisuse?.trim()), label: 'Voorzienbaar verkeerd gebruik' },
    { ok: familyRisks.length > 0, label: 'Minimaal 1 risicoanalyse' },
    { ok: familyWarnings.length > 0 || family.noWarningsNeeded === true, label: 'Waarschuwingen of expliciet niet nodig' },
    { ok: activeLinks.length > 0, label: 'Gekoppelde producten' },
    { ok: hasLinkedSupplierSource, label: 'Fabrikant/leverancier uit gekoppelde producten' },
    { ok: activeDocuments.length > 0, label: 'Minimaal 1 actief onderbouwend document' },
    { ok: linkedProducts.length > 0 && linkedProducts.every((product) => Boolean(product.brand?.trim())), label: 'Merk op alle gekoppelde producten' },
    { ok: linkedProducts.length > 0 && linkedProducts.every((product) => Boolean(product.safetyInfo?.trim())), label: 'Essentiële veiligheidskenmerken op alle gekoppelde producten' },
    { ok: familyRequirements.length > 0, label: 'Toepasselijke wetgeving/normen vastgelegd' },
    { ok: familyTests.length > 0, label: 'Test- of keuringsbewijs vastgelegd' },
  ];
  if (mandatoryRequirements.length > 0) {
    checks.push({ ok: openRequirements.length === 0, label: `Verplichte keuringen (${openRequirements.length} open)` });
  }
  if (mandatoryTestPlans.length > 0) {
    checks.push({ ok: openTestPlans.length === 0, label: `Verplichte tests (${openTestPlans.length} open)` });
  }
  const completedChecks = checks.filter((check) => check.ok).length;
  const progress = checks.length > 0 ? Math.round((completedChecks / checks.length) * 100) : 0;
  const expiringDocuments = familyDocuments.filter((document) => {
    if (!document.validUntil) return false;
    const days = (new Date(document.validUntil).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 60;
  });

  let calculatedStatus: ComplianceFamilyStatus = 'concept';
  if (family.status === 'archived') calculatedStatus = 'archived';
  else if (family.gpsrRequired === false) calculatedStatus = 'not_applicable';
  else if (progress === 100) calculatedStatus = 'complete';
  else if (family.status === 'in_review') calculatedStatus = 'in_review';
  else if (progress >= 50) calculatedStatus = 'partial';

  return {
    progress,
    activeLinks: activeLinks.length,
    riskCount: familyRisks.length,
    warningCount: familyWarnings.length,
    documentCount: familyDocuments.length,
    requirementCount: familyRequirements.length,
    openRequirementCount: openRequirements.length,
    testPlanCount: familyTestPlans.length,
    openTestPlanCount: openTestPlans.length,
    testCount: familyTests.length,
    expiringDocuments: expiringDocuments.length,
    missingItems: checks.filter((check) => !check.ok).map((check) => check.label),
    calculatedStatus,
  };
}

export function buildSuggestedComplianceLinks(
  products: Product[],
  families: ComplianceProductFamily[],
  existingLinks: ComplianceProductLink[],
) {
  const activeProductIds = new Set(
    existingLinks
      .filter((link) => (link.status ?? 'active') === 'active')
      .map((link) => link.productId),
  );

  const linkedPairs = new Set(existingLinks.map((link) => `${link.productId}|${link.familyId}`));

  return products.flatMap((product) => {
    if (!product.id || activeProductIds.has(product.id)) return [];
    const haystack = normalizeText([
      product.code,
      product.description,
      product.articleGroup,
      product.brand,
    ].filter(Boolean).join(' '));

    const match = families
      .map((family) => {
        const template = complianceTemplates.find((item) => item.code === family.code);
        if (!template) return null;
        const score = template.keywords.reduce((total, keyword) => total + (haystack.includes(normalizeText(keyword)) ? 1 : 0), 0);
        return score > 0 ? { family, score } : null;
      })
      .filter(Boolean)
      .sort((left, right) => (right?.score ?? 0) - (left?.score ?? 0))[0];

    if (!match) return [];
    const key = `${product.id}|${match.family.id}`;
    if (linkedPairs.has(key)) return [];

    return [{
      id: `compliance-link-${slugify(product.id)}-${slugify(match.family.id)}`,
      productId: product.id,
      familyId: match.family.id,
      variantDescription: product.articleGroup || undefined,
      status: 'active' as const,
      linkedBy: 'automatisch artikelgroep',
    }];
  });
}
