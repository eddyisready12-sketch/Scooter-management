export const packagingMaterialOptions = [
  { value: 'PAP 20', label: 'PAP 20 - Golfkarton', recycleCode: 'PAP 20', recycleFamily: 'PAP', recycleNumber: '20', wasteStream: 'Papier en karton' },
  { value: 'PAP 21', label: 'PAP 21 - Massief karton', recycleCode: 'PAP 21', recycleFamily: 'PAP', recycleNumber: '21', wasteStream: 'Papier en karton' },
  { value: 'PAP 22', label: 'PAP 22 - Papier', recycleCode: 'PAP 22', recycleFamily: 'PAP', recycleNumber: '22', wasteStream: 'Papier en karton' },
  { value: 'PE-LD 04', label: 'PE-LD 04 - LDPE plastic', recycleCode: 'PE-LD 04', recycleFamily: 'LDPE', recycleNumber: '4', wasteStream: 'Plastic / PMD' },
  { value: 'HDPE', label: 'HDPE', recycleCode: 'HDPE 2', recycleFamily: 'HDPE', recycleNumber: '2', wasteStream: 'Plastic / PMD' },
  { value: 'PP', label: 'PP', recycleCode: 'PP 5', recycleFamily: 'PP', recycleNumber: '5', wasteStream: 'Plastic / PMD' },
  { value: 'PET', label: 'PET', recycleCode: 'PET 1', recycleFamily: 'PET', recycleNumber: '1', wasteStream: 'Plastic / PMD' },
] as const;

function normalizeMaterialCode(value?: string) {
  const normalized = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (['DPE04', 'LDPE04', 'PELD04', 'PELD4'].includes(normalized)) return 'PELD04';
  if (['HDPE02', 'HDPE2'].includes(normalized)) return 'HDPE';
  if (['PP05', 'PP5'].includes(normalized)) return 'PP';
  if (['PET01', 'PET1'].includes(normalized)) return 'PET';
  return normalized;
}

export function findPackagingMaterialOption(value?: string) {
  const key = normalizeMaterialCode(value);
  return packagingMaterialOptions.find((option) => (
    normalizeMaterialCode(option.value) === key || normalizeMaterialCode(option.recycleCode) === key
  ));
}
