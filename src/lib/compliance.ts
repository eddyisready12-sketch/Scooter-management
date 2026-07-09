import type {
  ComplianceFamilyDocument,
  ComplianceFamilyRisk,
  ComplianceFamilyStatus,
  ComplianceFamilyWarning,
  ComplianceProductFamily,
  ComplianceProductLink,
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

export function createComplianceEntityId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
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

  return {
    families,
    risks,
    warnings,
    documents: [] as ComplianceFamilyDocument[],
  };
}

export function getComplianceFamilyStats(
  family: ComplianceProductFamily,
  risks: ComplianceFamilyRisk[],
  warnings: ComplianceFamilyWarning[],
  documents: ComplianceFamilyDocument[],
  links: ComplianceProductLink[],
) {
  const familyRisks = risks.filter((item) => item.familyId === family.id);
  const familyWarnings = warnings.filter((item) => item.familyId === family.id);
  const familyDocuments = documents.filter((item) => item.familyId === family.id);
  const activeLinks = links.filter((item) => item.familyId === family.id && (item.status ?? 'active') === 'active');

  const checks = [
    Boolean(family.description?.trim()),
    Boolean(family.intendedUse?.trim()),
    Boolean(family.foreseeableMisuse?.trim()),
    familyRisks.length > 0,
    familyWarnings.length > 0,
    activeLinks.length > 0,
  ];
  const completedChecks = checks.filter(Boolean).length;
  const progress = Math.round((completedChecks / checks.length) * 100);
  const expiringDocuments = familyDocuments.filter((document) => {
    if (!document.validUntil) return false;
    const days = (new Date(document.validUntil).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 60;
  });

  let calculatedStatus: ComplianceFamilyStatus = 'concept';
  if (family.status === 'archived') calculatedStatus = 'archived';
  else if (family.gpsrRequired === false) calculatedStatus = 'not_applicable';
  else if (progress === 100) calculatedStatus = 'complete';
  else if (progress >= 50) calculatedStatus = 'partial';

  return {
    progress,
    activeLinks: activeLinks.length,
    riskCount: familyRisks.length,
    warningCount: familyWarnings.length,
    documentCount: familyDocuments.length,
    expiringDocuments: expiringDocuments.length,
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
