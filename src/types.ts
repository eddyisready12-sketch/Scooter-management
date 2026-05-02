export type ScooterStatus =
  | 'Beschikbaar'
  | 'Verkocht dealer'
  | 'Verkocht klant'
  | 'Af te leveren'
  | 'Nog onderweg'
  | 'In consignatie'
  | 'In optie';

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
  batteryNumber?: string;
  invoiceNumber?: string;
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

export type Dealer = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  Postalcode?: string;
};

export type Battery = {
  id: string;
  lotNumber: string;
  model: string;
  spec: string;
  scooterFrame?: string;
  status: 'Voorraad' | 'In consignatie' | 'Gekoppeld';
};

export type WarrantyPart = {
  id: string;
  scooterFrame: string;
  licensePlate?: string;
  partName: string;
  partNumber: string;
  mileage?: string;
  age?: string;
  claimDate: string;
  warrantyUntil: string;
  status: 'Open' | 'In behandeling' | 'Goedgekeurd' | 'Afgewezen' | 'Vervangen';
  dealerId?: string;
  notes: string;
};

export type DocumentRecord = {
  id: string;
  scooterFrame: string;
  type: 'Invoice' | 'COC' | 'Warranty' | 'Photo' | 'Other';
  fileName: string;
  note: string;
};

export type AppData = {
  scooters: Scooter[];
  containers: Container[];
  dealers: Dealer[];
  batteries: Battery[];
  warranties: WarrantyPart[];
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
  licensePlate?: string;
  batteryNumber?: string;
  invoiceNumber?: string;
};
