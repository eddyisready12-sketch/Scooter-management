export type ScooterStatus =
  | 'Beschikbaar'
  | 'Verkocht dealer'
  | 'Verkocht klant'
  | 'Af te leveren'
  | 'Nog onderweg'
  | 'In consignatie'
  | 'In optie'
  | 'Overig';

export type Scooter = {
  id: string;
  frameNumber: string;
  engineNumber: string;
  brand: 'RSO';
  model: string;
  color: string;
  colorNumber?: string;
  speed: string;
  status: ScooterStatus;
  dealerId?: string;
  containerId?: string;
  licensePlate?: string;
  firstAdmissionDate?: string;
  firstRegistrationDate?: string;
  lastRegistrationDate?: string;
  emissionClass?: string;
  rdwType?: string;
  rdwTypeApprovalNumber?: string;
  rdwVariant?: string;
  rdwExecution?: string;
  batteryNumber?: string;
  invoiceNumber?: string;
  isUnpacked?: boolean;
  arrivedAt?: string;
  deliveredAt?: string;
  soldAt?: string;
};

export type ContainerStatus = 'In land van herkomst' | 'Onderweg' | 'Aangekomen';

export type Container = {
  id: string;
  number: string;
  invoiceNumber: string;
  sealNumber: string;
  status: ContainerStatus;
  eta: string;
  arrivedAt?: string;
};

export type ContainerCostAllocationMode = 'volume' | 'value';
export type ContainerCostItemCategory = 'transport' | 'import' | 'other';
export type BatchPackagingScope = 'Eigen import' | 'EU-import' | 'Binnenlandse inkoop';
export type BatchPackagingReportingMode = 'Alles registreren' | 'Alleen SUP' | 'Vrijgesteld';
export type BatchPackagingExactSource = 'Ordernummer' | 'Batchnummer' | 'Handmatig';

export type BatchPackagingComplianceConfig = {
  scope?: BatchPackagingScope;
  reportingMode?: BatchPackagingReportingMode;
  exactSource?: BatchPackagingExactSource;
  profileName?: string;
  notes?: string;
};

export type ContainerCostBatch = {
  id: string;
  status?: 'Concept' | 'Definitief';
  containerId?: string;
  containerNumber: string;
  containerProfile?: string;
  containerVolumeCbm?: string;
  orderNumber: string;
  supplierName?: string;
  importerId?: string;
  importerName?: string;
  importerAddress?: string;
  importerPostalCode?: string;
  importerCity?: string;
  importerCountry?: string;
  importerEmail?: string;
  importerWebsite?: string;
  currency: 'USD' | 'EUR';
  exchangeRate: string;
  chinaTransportUsd?: string;
  transportCostEur: string;
  importCostEur: string;
  otherCostEur?: string;
  transportAllocationMode: ContainerCostAllocationMode;
  importAllocationMode: ContainerCostAllocationMode;
  costItemsJson?: string;
  goodsNetEur?: string;
  logisticsNetEur?: string;
  paymentNetEur?: string;
  paymentNetOverrideEur?: string;
  exactReference?: string;
  packagingComplianceJson?: string;
  notes?: string;
  createdAt?: string;
};

export type ContainerCostLineType = 'onderdeel' | 'scooter' | 'samengesteld';

export type ContainerCostLine = {
  id: string;
  batchId: string;
  type: ContainerCostLineType;
  referenceId?: string;
  referenceCode: string;
  description: string;
  quantity: string;
  volumeCbm: string;
  unitPriceUsd: string;
  goodsValueEur: string;
  allocatedTransportEur: string;
  allocatedImportEur: string;
  allocatedOtherEur: string;
  calculatedUnitCostEur: string;
  componentsNote?: string;
  purchaseOrderAdded?: boolean;
};

export type ScooterPackagingSpec = {
  id: string;
  model: string;
  component: 'CBU' | 'SKD';
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  hasLining?: boolean;
  boxWeightKg?: string;
  notes?: string;
  updatedAt?: string;
};

export type Dealer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  Postalcode?: string;
  active?: boolean;
};

export type Battery = {
  id: string;
  lotNumber: string;
  model: string;
  spec: string;
  scooterFrame?: string;
  status: 'Beschikbaar' | 'Voorraad' | 'In consignatie' | 'Gekoppeld' | 'Verkocht';
  dealerId?: string;
  orderNumber?: string;
  chargeDate?: string;
  soldAt?: string;
};

export type BatteryModel = {
  id: string;
  name: string;
  spec: string;
  nominalVoltage: string;
  nominalCapacity: string;
  ratedEnergy: string;
  maxChargeVoltage: string;
  minDischargeVoltage: string;
};

export type Product = {
  id: string;
  code: string;
  supplierItemNo?: string;
  isNewProduct?: boolean;
  createdAt?: string;
  description: string;
  barcode?: string;
  batch?: string;
  salePrice?: string;
  purchasePrice?: string;
  costPrice?: string;
  webshop?: boolean;
  articleGroup?: string;
  stock?: string;
  startDate?: string;
  endDate?: string;
  supplier?: string;
  importCompany?: string;
  countryOfOrigin?: string;
  imageUrl?: string;
  brand?: string;
  labelTitle?: string;
  shortDescription?: string;
  batchNumber?: string;
  serialNumber?: string;
  traceabilityCode?: string;
  qrUrl?: string;
  warning?: string;
  safetyInfo?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  manufacturerPostalCode?: string;
  manufacturerCity?: string;
  manufacturerCountry?: string;
  manufacturerEmail?: string;
  manufacturerWebsite?: string;
  importerName?: string;
  importerAddress?: string;
  importerPostalCode?: string;
  importerCity?: string;
  importerCountry?: string;
  importerEmail?: string;
  importerWebsite?: string;
  euResponsiblePersonName?: string;
  euResponsiblePersonAddress?: string;
  euResponsiblePersonPostalCode?: string;
  euResponsiblePersonCity?: string;
  euResponsiblePersonCountry?: string;
  euResponsiblePersonEmail?: string;
  euResponsiblePersonWebsite?: string;
  packagingUnit?: string;
  packagingLayers?: ProductPackagingLayer[];
  packagingMaterialPrimary?: string;
  packagingMaterialSecondary?: string;
  packagingRecycleCodePrimary?: string;
  packagingRecycleCodeSecondary?: string;
  packagingWasteStream?: string;
  packagingNotes?: string;
  packagingWeightPrimaryGrams?: string;
  packagingWeightSecondaryGrams?: string;
  packagingWeightTotalGrams?: string;
  complianceCategory?: 'STANDARD_PART' | 'SAFETY_RELEVANT_PART' | 'ELECTRICAL_PART' | 'BATTERY_PRODUCT' | 'TYPE_APPROVAL_RELATED' | 'E_MARK_RELEVANT';
  eMarkRelevant?: 'ja' | 'nee' | 'onbekend';
  eMarkPresent?: 'ja' | 'nee' | 'niet_van_toepassing' | 'onbekend';
  eMarkNumber?: string;
  ceRelevant?: 'ja' | 'nee' | 'onbekend';
  cePresent?: 'ja' | 'nee' | 'niet_van_toepassing' | 'onbekend';
  certificationNotes?: string;
  certificateDocumentId?: string;
  complianceResponsibilityOverride?: 'own' | 'outsourced';
  complianceResponsibilityReference?: string;
  complianceResponsibilitySetAt?: string;
  complianceResponsibilitySetBy?: string;
};

export type Herkomst = 'eu' | 'niet_eu';
export type PpwrSupplierRole = 'fabrikant_eu' | 'distributeur_eu' | 'productleverancier_niet_eu';
export type DocStatus = 'niet_gevraagd' | 'gevraagd' | 'toegezegd' | 'ontvangen' | 'kan_niet_leveren';

export type SupplierDocStatus = {
  status: DocStatus;
  statusDatum: string;
  toegezegdVoor?: string;
  bestandsnaam?: string;
  notitie?: string;
};

export type VerpakkingsLaag = {
  id: string;
  rol: 'primair' | 'secundair' | 'transport';
  materiaalcode: string;
  gewichtGram: number;
  gewichtBasis: 'per_stuk' | 'per_doos';
  recyclaatPercentage?: number;
  herbruikbaar: boolean;
  zorgwekkendeStoffen: 'geen_bekend' | 'onderzoek_loopt' | 'aanwezig';
  bron: 'opgave_leverancier' | 'eigen_meting' | 'schatting';
};

export type IngekochtVerpakkingsartikel = {
  id: string;
  orderNummer: string;
  besteldOp?: string;
  artikelCode: string;
  omschrijving: string;
  afmetingen?: string;
  materiaalcode: string;
  gewichtGram: number;
  gewichtBasis: 'per_stuk' | 'per_doos';
  aantalIngekocht?: number;
  recyclaatPercentage?: number;
  herbruikbaar: boolean;
  zorgwekkendeStoffen: 'geen_bekend' | 'onderzoek_loopt' | 'aanwezig';
  bron: 'opgave_leverancier' | 'eigen_meting' | 'schatting';
  actief: boolean;
};

export type Supplier = {
  id: string;
  name: string;
  isImportCompany?: boolean;
  isPackagingSupplier?: boolean;
  importerId?: string;
  euResponsiblePersonId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  supplierSchemaVersion?: number;
  herkomst?: Herkomst;
  docStatus?: SupplierDocStatus;
  packagingProfile?: VerpakkingsLaag[];
  packagingItems?: IngekochtVerpakkingsartikel[];
  packagingMaterials?: string;
  ppwrSupplierRole?: PpwrSupplierRole | 'Producent' | 'Converter' | 'Handelaar' | 'Co-packer';
  ppwrResponsibility?: 'Primair' | 'Secundair' | 'Tertiair' | 'Combinatie';
  ppwrContractStatus?: 'Niet gestart' | 'In aanvraag' | 'Actief' | 'Geblokkeerd' | 'Verlopen';
  ppwrDeclarationStatus?: 'Ontbreekt' | 'Aangevraagd' | 'Ontvangen' | 'Goedgekeurd';
  ppwrEprNumber?: string;
  ppwrLastDeclarationAt?: string;
  ppwrNotes?: string;
  notes?: string;
  active?: boolean;
  complianceResponsibility?: 'own' | 'outsourced';
  complianceResponsibilityReference?: string;
  complianceResponsibilityEstablishedAt?: string;
  complianceResponsibilitySetBy?: string;
  complianceResponsibilityAudit?: Array<{
    responsibility: 'own' | 'outsourced';
    reference?: string;
    establishedAt: string;
    changedBy: string;
  }>;
};

export type Importer = {
  id: string;
  name: string;
  email?: string;
  website?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  notes?: string;
  active?: boolean;
};

export type SupplierContact = {
  id: string;
  supplierId: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  wechat?: string;
  notes?: string;
  isPrimary?: boolean;
  active?: boolean;
};

export type ComplianceRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ComplianceFamilyStatus = 'concept' | 'in_review' | 'partial' | 'complete' | 'not_applicable' | 'archived';

export type ComplianceProductFamily = {
  id: string;
  code: string;
  name: string;
  category?: string;
  description?: string;
  intendedUse?: string;
  foreseeableMisuse?: string;
  riskLevel?: ComplianceRiskLevel;
  gpsrRequired?: boolean;
  noWarningsNeeded?: boolean;
  manualText?: string;
  manufacturerName?: string;
  manufacturerContact?: string;
  status?: ComplianceFamilyStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ComplianceFamilyRisk = {
  id: string;
  familyId: string;
  hazard: string;
  riskDescription?: string;
  severity?: string;
  probability?: string;
  mitigation?: string;
  residualRisk?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ComplianceFamilyWarning = {
  id: string;
  familyId: string;
  warningType?: string;
  warningTextNl: string;
  warningTextEn?: string;
  requiredOnLabel?: boolean;
  requiredInManual?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ComplianceFamilyDocument = {
  id: string;
  familyId: string;
  requirementId?: string;
  documentType?: string;
  documentName: string;
  filePath?: string;
  fileUrl?: string;
  validFrom?: string;
  validUntil?: string;
  status?: 'active' | 'expired' | 'pending' | 'revoked';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ComplianceFamilyRequirement = {
  id: string;
  familyId: string;
  name: string;
  regulation?: string;
  mandatory?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ComplianceFamilyTestPlan = {
  id: string;
  familyId: string;
  name: string;
  method?: string;
  frequency?: string;
  mandatory?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ComplianceProductTestResult = 'pass' | 'fail' | 'conditional';

export type ComplianceProductTest = {
  id: string;
  familyId: string;
  planId?: string;
  productId?: string;
  testName?: string;
  batchRef?: string;
  testDate: string;
  result?: ComplianceProductTestResult;
  findings?: string;
  correctiveAction?: string;
  testedBy?: string;
  createdAt?: string;
};

export type ComplianceFamilyRevision = {
  id: string;
  familyId: string;
  changeNote: string;
  changedBy?: string;
  createdAt?: string;
};

export type ComplianceProductLink = {
  id: string;
  productId: string;
  familyId: string;
  variantDescription?: string;
  technicalDifferences?: string;
  overrideWarnings?: string;
  overrideManual?: string;
  status?: 'active' | 'inactive';
  linkedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductPackagingLayer = {
  name?: string;
  material?: string;
  recycleCode?: string;
  packagingSupplier?: string;
  packagingCatalogItemId?: string;
  weightBasis?: 'per_stuk' | 'per_doos';
  weightGrams?: string;
  recycledContentPercent?: string;
  recyclabilityClass?: 'Klasse A' | 'Klasse B' | 'Klasse C' | 'Klasse D' | 'Klasse E';
  packagingRole?: 'Primair' | 'Secundair' | 'Tertiair';
  productStickerMaterial?: 'Geen' | 'Papier' | 'Plastic PP';
};

export type ProductPackagingRegistration = {
  id: string;
  batchId: string;
  batchOrderNumber?: string;
  batchNumber?: string;
  containerNumber?: string;
  containerCostLineId?: string;
  productId?: string;
  productCode: string;
  productDescription: string;
  productBarcode?: string;
  quantity: string;
  packagingUnit?: string;
  packagesCount?: string;
  unitsPerPackage?: string;
  layerName: string;
  material: string;
  recycleCode?: string;
  packagingSupplier?: string;
  wasteStream?: string;
  recycledContentPercent?: string;
  recyclabilityClass?: string;
  packagingRole?: string;
  productStickerMaterial?: string;
  weightGramsPerUnit: string;
  totalWeightGrams: string;
  source?: 'product_snapshot' | 'batch_override' | 'manual';
  registeredAt?: string;
  labelPrintedAt?: string;
  labelPrintCount?: string;
  notes?: string;
};

export type ExactSalesPackagingOverride = {
  id: string;
  productCode: string;
  batchNumber: string;
  productDescription?: string;
  packagingUnit?: string;
  layerName: string;
  material: string;
  recycleCode?: string;
  packagingSupplier?: string;
  wasteStream?: string;
  recycledContentPercent?: string;
  recyclabilityClass?: string;
  packagingRole?: string;
  productStickerMaterial?: string;
  weightGramsPerUnit: string;
  notes?: string;
  updatedAt?: string;
};

export type WarrantyPart = {
  id: string;
  claimNumber?: string;
  scooterFrame: string;
  licensePlate?: string;
  partName: string;
  partNumber: string;
  partPrice?: string;
  claimItems?: Array<{
    productCode?: string;
    partName: string;
    partNumber?: string;
    partPrice?: string;
  }>;
  mileage?: string;
  age?: string;
  claimDate: string;
  warrantyUntil: string;
  status: 'Open' | 'In behandeling' | 'Goedgekeurd' | 'Afgewezen' | 'Vervangen' | 'Afgehandeld';
  dealerId?: string;
  notes: string;
};

export type MaintenanceRecord = {
  id: string;
  scooterFrame: string;
  licensePlate?: string;
  servicePackage?: string;
  serviceDate: string;
  serviceType: string;
  mileage?: string;
  nextServiceDate?: string;
  status: 'Gepland' | 'Uitgevoerd' | 'Aandacht nodig';
  checklist?: string[];
  notes: string;
};

export type DocumentRecord = {
  id: string;
  scooterFrame: string;
  type: 'CVO' | 'Overschrijving' | 'Vrijwaringsbewijs' | 'Tijdelijk document' | 'Factuur' | 'Overig';
  fileName: string;
  note: string;
  storagePath?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt?: string;
};

export type ExactConnectionStatus = {
  id: string;
  provider: 'exact';
  isConnected: boolean;
  administrationName?: string;
  divisionCode?: string;
  exactUserName?: string;
  redirectUri?: string;
  connectedAt?: string;
  tokenExpiresAt?: string;
  lastSyncAt?: string;
  lastError?: string;
};

export type ExactSalesPreviewLine = {
  id: string;
  exactGoodsDeliveryLineId?: string;
  itemId?: string;
  deliveryDate?: string;
  salesOrderNumber?: string;
  entryId?: string;
  lineNumber?: string;
  salesOrderLineId?: string;
  itemCode?: string;
  itemDescription?: string;
  quantityDelivered?: string;
  quantityOrdered?: string;
  batchNumber?: string;
  batchCount?: string;
  deliveryCountryCode?: string;
  deliveryCountryName?: string;
  description?: string;
};

export type ExactEndpointProbeResult = {
  endpoint: string;
  ok: boolean;
  count?: number;
  sample?: Array<Record<string, string>>;
  message?: string;
};

export type ExactSalesPreviewResponse = {
  lines?: ExactSalesPreviewLine[];
  debug?: boolean;
  count?: number;
  raw?: Array<Record<string, unknown>>;
  divisionCode?: string;
  probes?: ExactEndpointProbeResult[];
};

export type ExactBatchProbeResult = {
  endpoint: string;
  ok: boolean;
  message?: string;
  count?: number;
  sample?: Array<Record<string, string>>;
};

export type ExactProductImportRow = {
  code: string;
  description: string;
  barcode?: string;
  articleGroup?: string;
  salePrice?: string;
  purchasePrice?: string;
  costPrice?: string;
  webshop?: boolean;
  shortDescription?: string;
  createdAt?: string;
};

export type ExactProductImportResponse = {
  products: ExactProductImportRow[];
  count: number;
  divisionCode?: string;
  requestedItemCode?: string;
  rawRowsFetched?: number;
  pagesProcessed?: number;
  lastSkip?: number;
};

export type AppData = {
  scooters: Scooter[];
  containers: Container[];
  containerCostBatches: ContainerCostBatch[];
  containerCostLines: ContainerCostLine[];
  scooterPackagingSpecs: ScooterPackagingSpec[];
  productPackagingRegistrations: ProductPackagingRegistration[];
  exactSalesPackagingOverrides: ExactSalesPackagingOverride[];
  complianceFamilies: ComplianceProductFamily[];
  complianceFamilyRisks: ComplianceFamilyRisk[];
  complianceFamilyWarnings: ComplianceFamilyWarning[];
  complianceFamilyDocuments: ComplianceFamilyDocument[];
  complianceFamilyRequirements: ComplianceFamilyRequirement[];
  complianceFamilyTestPlans: ComplianceFamilyTestPlan[];
  complianceProductTests: ComplianceProductTest[];
  complianceFamilyRevisions: ComplianceFamilyRevision[];
  complianceProductLinks: ComplianceProductLink[];
  dealers: Dealer[];
  products: Product[];
  suppliers: Supplier[];
  importers: Importer[];
  supplierContacts: SupplierContact[];
  batteries: Battery[];
  batteryModels: BatteryModel[];
  warranties: WarrantyPart[];
  maintenance: MaintenanceRecord[];
  documents: DocumentRecord[];
};

export type CsvScooterRow = {
  model?: string;
  frameNumber?: string;
  engineNumber?: string;
  color?: string;
  speed?: string;
  status?: ScooterStatus;
  dealer?: string;
  container?: string;
  containerId?: string;
  arrivedAt?: string;
  licensePlate?: string;
  batteryNumber?: string;
  invoiceNumber?: string;
};
