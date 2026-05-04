import type { AppData, ScooterStatus } from '../types';

const statuses: ScooterStatus[] = [
  'Beschikbaar',
  'Verkocht dealer',
  'Verkocht klant',
  'Af te leveren',
  'Nog onderweg',
  'In consignatie',
  'In optie',
];

const models = ['SENSE', 'CORAL', 'S9', 'SPEEDY', 'E-S5', 'TX-250'];
const colors = ['MATT BLACK', 'WHITE', 'PEARL BLUE PURPLE', 'OLIVE GREEN', 'NARDO GREY', 'MAT ZWART'];
const dealers = [
  { id: 'd1', name: 'Rob Dekker', company: 'Tweewieler Company', email: 'rob@tweewieler.example', phone: '+31 6 1542 0199', city: 'Rotterdam', address: 'Maasboulevard 14' },
  { id: 'd2', name: 'Sander Geerts', company: 'Hamaparts', email: 'info@hamaparts.example', phone: '+31 6 8129 7727', city: 'Vlaardingen', address: 'Industrieweg 21' },
  { id: 'd3', name: 'Ilse Bloem', company: 'Polderscooter', email: 'ilse@polderscooter.example', phone: '+31 6 3902 5082', city: 'Dronten', address: 'De Noord 4' },
  { id: 'd4', name: 'Freck de Jong', company: 'Scooter Service Rotterdam', email: 'freck@scooterservice.example', phone: '+31 6 5311 2879', city: 'Rotterdam', address: 'Schiekade 102' },
  { id: 'd5', name: 'Jorden Kleinjan', company: 'Q Trading', email: 'jorden@qtrading.example', phone: '+31 6 3725 3288', city: 'Ridderkerk', address: 'Handelsweg 8' },
];

const containers = [
  { id: 'c1', number: 'CAAU5151293', invoiceNumber: '24WLE819-2', sealNumber: 'ML-CN1361377', status: 'Aangekomen' as const, eta: '2026-05-20', arrivedAt: '2026-04-25T05:59:00' },
  { id: 'c2', number: 'FSCU8979996', invoiceNumber: '25WLIE841', sealNumber: 'RSO-841', status: 'Onderweg' as const, eta: '2026-06-14' },
  { id: 'c3', number: 'MRKU5051658', invoiceNumber: '25WLIE822', sealNumber: 'RSO-822', status: 'In land van herkomst' as const, eta: '2026-07-04' },
  { id: 'c4', number: 'HDMU6677310', invoiceNumber: '925WL24811', sealNumber: 'RSO-811', status: 'Aangekomen' as const, eta: '2026-04-18', arrivedAt: '2026-04-18T09:30:00' },
];

const scooters = Array.from({ length: 42 }, (_, index) => {
  const model = models[index % models.length];
  const status = statuses[index % statuses.length];
  const dealer = dealers[index % dealers.length];
  const container = containers[index % containers.length];
  return {
    id: `s${index + 1}`,
    frameNumber: `L5YBYCBA${String(index + 1).padStart(2, '0')}S1154${100 + index}`,
    engineNumber: `S2205${414 + index}`,
    brand: 'RSO' as const,
    model,
    color: colors[index % colors.length],
    speed: index % 3 === 0 ? '25km/h' : '45km/h',
    status,
    dealerId: ['Verkocht dealer', 'Verkocht klant', 'In consignatie', 'In optie'].includes(status) ? dealer.id : undefined,
    containerId: container.id,
    licensePlate: status === 'Verkocht klant' ? `FVR-${210 + index}` : '',
    batteryNumber: index % 4 === 0 ? `ASFC18-2210${index}` : '',
    invoiceNumber: index % 5 === 0 ? `INV-${202600 + index}` : '',
    arrivedAt: container.arrivedAt,
    deliveredAt: status === 'Af te leveren' ? '2026-05-12T14:00:00' : undefined,
    soldAt: status.includes('Verkocht') ? '2026-04-28T11:00:00' : undefined,
  };
});

export const demoData: AppData = {
  scooters,
  containers,
  dealers,
  batteries: [
    { id: 'b1', lotNumber: 'ASFC18-221026N001', model: 'JD60V30AH', spec: '60V 30Ah 1800Wh', scooterFrame: scooters[0].frameNumber, status: 'Beschikbaar', chargeDate: '2023-07-10' },
    { id: 'b2', lotNumber: 'ASFC18-230328N005', model: 'JD72V20AH', spec: '72V 20Ah 1440Wh', status: 'Voorraad', chargeDate: '2023-08-02' },
    { id: 'b3', lotNumber: 'ADRC14-230328N009', model: 'JD60V30AH', spec: '60V 30Ah 1800Wh', dealerId: 'd2', status: 'In consignatie', chargeDate: '2023-08-18' },
  ],
  batteryModels: [
    { id: 'battery-model-jd60v30ah', name: 'JD60V30AH', spec: '60V 30Ah 1800Wh', nominalVoltage: '67.2V', nominalCapacity: '30Ah', ratedEnergy: '1800Wh', maxChargeVoltage: '67.2V', minDischargeVoltage: '45V' },
    { id: 'battery-model-jd72v20ah', name: 'JD72V20AH', spec: '72V 20Ah 1440Wh', nominalVoltage: '84V', nominalCapacity: '20Ah', ratedEnergy: '1440Wh', maxChargeVoltage: '84V', minDischargeVoltage: '56V' },
  ],
  warranties: [
    { id: 'w1', scooterFrame: scooters[0].frameNumber, partName: 'Controller', partNumber: 'RSO-CTRL-45', claimDate: '2026-04-21', warrantyUntil: '2028-04-21', status: 'Open', dealerId: 'd1', notes: 'Intermittent throttle response.' },
    { id: 'w2', scooterFrame: scooters[4].frameNumber, partName: 'Battery pack', partNumber: 'RSO-BAT-60V', claimDate: '2026-03-18', warrantyUntil: '2028-03-18', status: 'In behandeling', dealerId: 'd2', notes: 'Capacity drops under load.' },
  ],
  maintenance: [
    { id: 'm1', scooterFrame: scooters[2].frameNumber, licensePlate: scooters[2].licensePlate, servicePackage: 'Kleine onderhoudsbeurt', serviceDate: '2026-04-12', serviceType: 'Aflevercontrole', mileage: '12', nextServiceDate: '2026-10-12', status: 'Uitgevoerd', checklist: ['Bandenspanningscheck', 'Verlichtingscheck'], notes: 'Controle voor aflevering.' },
  ],
  documents: [
    { id: 'doc1', scooterFrame: scooters[0].frameNumber, type: 'CVO', fileName: 'coc-coral-878.pdf', note: 'Uploaded after arrival inspection.', storagePath: `${scooters[0].frameNumber}/coc-coral-878.pdf`, mimeType: 'application/pdf', uploadedAt: '2026-04-26T10:14:00' },
  ],
};
