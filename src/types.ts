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
};

export type Supplier = {
  id: string;
  name: string;
  isImportCompany?: boolean;
  importerId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  notes?: string;
  active?: boolean;
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

export type ProductPackagingLayer = {
  name?: string;
  material?: string;
  recycleCode?: string;
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

export type AppData = {
  scooters: Scooter[];
  containers: Container[];
  containerCostBatches: ContainerCostBatch[];
  containerCostLines: ContainerCostLine[];
  scooterPackagingSpecs: ScooterPackagingSpec[];
  productPackagingRegistrations: ProductPackagingRegistration[];
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
