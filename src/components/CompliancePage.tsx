import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  DatabaseZap,
  FileText,
  FolderKanban,
  CircleHelp,
  LayoutDashboard,
  Link2,
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  buildComplianceTemplateSeed,
  buildSuggestedComplianceLinks,
  createComplianceEntityId,
  getComplianceFamilyStats,
  requirementFulfilled,
  testPlanFulfilled,
} from '../lib/compliance';
import { createPackagingProfileLayer, createPurchasedPackagingItem, migrateSupplierPpwr, ppwrSupplierStatus, roleHerkomst } from '../lib/ppwr-suppliers';
import type {
  ComplianceFamilyDocument,
  ComplianceFamilyRequirement,
  ComplianceFamilyRevision,
  ComplianceFamilyRisk,
  ComplianceFamilyTestPlan,
  ComplianceFamilyWarning,
  ComplianceProductFamily,
  ComplianceProductLink,
  ComplianceProductTest,
  Importer,
  Product,
  Scooter,
  Supplier,
} from '../types';

type ComplianceModuleView = 'dashboard' | 'families' | 'unlinked' | 'documents' | 'templates' | 'packagingSuppliers';
type ComplianceDetailTab = 'basic' | 'risks' | 'warnings' | 'requirements' | 'tests' | 'documents' | 'links' | 'revisions' | 'dossier';
type ComplianceDashboardTab = 'incomplete' | 'outsourced' | 'highRisk' | 'requirements' | 'tests' | 'missingDocuments' | 'expiringDocuments' | 'expiredDocuments';

type CompliancePageProps = {
  products: Product[];
  scooters: Scooter[];
  families: ComplianceProductFamily[];
  risks: ComplianceFamilyRisk[];
  warnings: ComplianceFamilyWarning[];
  documents: ComplianceFamilyDocument[];
  requirements: ComplianceFamilyRequirement[];
  testPlans: ComplianceFamilyTestPlan[];
  tests: ComplianceProductTest[];
  revisions: ComplianceFamilyRevision[];
  links: ComplianceProductLink[];
  suppliers: Supplier[];
  importers: Importer[];
  message?: string;
  onSeedTemplates: (seed: ReturnType<typeof buildComplianceTemplateSeed>) => Promise<void>;
  onSaveFamilyBundle: (payload: {
    family: ComplianceProductFamily;
    risks: ComplianceFamilyRisk[];
    warnings: ComplianceFamilyWarning[];
    documents: ComplianceFamilyDocument[];
    requirements: ComplianceFamilyRequirement[];
    testPlans: ComplianceFamilyTestPlan[];
    tests: ComplianceProductTest[];
    revisions: ComplianceFamilyRevision[];
    links: ComplianceProductLink[];
  }) => Promise<void>;
  onAutoLinkProducts: (links: ComplianceProductLink[]) => Promise<void>;
  onDeactivateProductLink: (link: ComplianceProductLink, revision: ComplianceFamilyRevision) => Promise<void>;
  onActivateProductLink: (link: ComplianceProductLink, revision: ComplianceFamilyRevision) => Promise<void>;
  onSavePackagingSupplier: (supplier: Supplier) => Promise<void>;
  onUploadSupplierDocument: (file: File, supplierId: string) => Promise<string>;
  onSelectProduct: (product: Product, tab?: 'basic' | 'gpsr') => void;
};

const moduleViews: Array<{ id: ComplianceModuleView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'families', label: 'Productfamilies', icon: FolderKanban },
  { id: 'unlinked', label: 'Producten zonder familie', icon: PackageSearch },
  { id: 'documents', label: 'Documenten', icon: FileText },
  { id: 'templates', label: 'Templates', icon: DatabaseZap },
  { id: 'packagingSuppliers', label: 'PPWR leveranciers', icon: ShieldCheck },
];

const detailTabs: Array<{ id: ComplianceDetailTab; label: string }> = [
  { id: 'basic', label: 'Basisinformatie' },
  { id: 'risks', label: 'Risicoanalyse' },
  { id: 'warnings', label: 'Waarschuwingen' },
  { id: 'requirements', label: 'Keuringseisen' },
  { id: 'tests', label: 'Testplannen' },
  { id: 'documents', label: 'Documenten' },
  { id: 'links', label: 'Gekoppelde producten' },
  { id: 'revisions', label: 'Revisies' },
];

const dashboardTabs: Array<{ id: ComplianceDashboardTab; label: string }> = [
  { id: 'incomplete', label: 'Incomplete dossiers' },
  { id: 'outsourced', label: 'Uitbesteed aan leverancier' },
  { id: 'highRisk', label: 'Hoog risico families' },
  { id: 'requirements', label: 'Keuringen' },
  { id: 'tests', label: 'Tests' },
  { id: 'missingDocuments', label: 'Ontbrekende documenten' },
  { id: 'expiringDocuments', label: 'Verloopt binnenkort' },
  { id: 'expiredDocuments', label: 'Verlopen documenten' },
];

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function asNumber(value?: string) {
  const parsed = Number.parseFloat((value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(value?: string) {
  switch (value) {
    case 'complete': return 'Compleet';
    case 'partial': return 'Gedeeltelijk';
    case 'in_review': return 'In review';
    case 'not_applicable': return 'N.v.t.';
    case 'archived': return 'Archief';
    case 'concept':
    default:
      return 'Concept';
  }
}

function riskLabel(value?: string) {
  switch (value) {
    case 'low': return 'Laag';
    case 'high': return 'Hoog';
    case 'critical': return 'Kritiek';
    case 'medium':
    default:
      return 'Matig';
  }
}

function familyDocumentationLabel(value?: string) {
  switch (value) {
    case 'complete':
      return 'Documentatie compleet';
    case 'partial':
    case 'in_review':
      return 'Documentatie gedeeltelijk compleet';
    case 'not_applicable':
      return 'Niet van toepassing';
    case 'archived':
      return 'Archief';
    case 'concept':
    default:
      return 'Concept';
  }
}

function expiryState(value?: string) {
  if (!value) return 'none';
  const days = (new Date(value).getTime() - Date.now()) / 86400000;
  if (days < 0) return 'expired';
  if (days <= 60) return 'soon';
  return 'ok';
}

function escapeHtml(value?: string) {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSupplierName(value?: string) {
  return (value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function productIsOutsourced(product: Product, suppliers: Supplier[]) {
  if (product.complianceResponsibilityOverride) return product.complianceResponsibilityOverride === 'outsourced';
  const supplier = suppliers.find((item) => normalizeSupplierName(item.name) === normalizeSupplierName(product.supplier));
  return supplier?.complianceResponsibility === 'outsourced';
}

function packagingSupplierProfileReady(supplier?: Supplier) {
  return ppwrSupplierStatus(supplier) === 'compleet';
}

function supplierStatusLabel(supplier?: Supplier) {
  const status = ppwrSupplierStatus(supplier);
  return status === 'compleet' ? 'Compleet' : status === 'geblokkeerd' ? 'Geblokkeerd' : 'Aanvullen';
}

export function CompliancePage({
  products,
  scooters,
  families,
  risks,
  warnings,
  documents,
  requirements,
  testPlans,
  tests,
  revisions,
  links,
  suppliers,
  importers,
  message,
  onSeedTemplates,
  onSaveFamilyBundle,
  onAutoLinkProducts,
  onDeactivateProductLink,
  onActivateProductLink,
  onSavePackagingSupplier,
  onUploadSupplierDocument,
  onSelectProduct,
}: CompliancePageProps) {
  const [moduleView, setModuleView] = useState<ComplianceModuleView>('dashboard');
  const [detailTab, setDetailTab] = useState<ComplianceDetailTab>('basic');
  const [dashboardTab, setDashboardTab] = useState<ComplianceDashboardTab>('incomplete');
  const [familyQuery, setFamilyQuery] = useState('');
  const [familyCategoryFilter, setFamilyCategoryFilter] = useState('all');
  const [familyStatusFilter, setFamilyStatusFilter] = useState('all');
  const [templateQuery, setTemplateQuery] = useState('');
  const [templateRiskFilter, setTemplateRiskFilter] = useState<'all' | ComplianceProductFamily['riskLevel']>('all');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('');
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkPage, setLinkPage] = useState(1);
  const [dossierPickerOpen, setDossierPickerOpen] = useState(false);
  const [dossierProductId, setDossierProductId] = useState('');
  const [dossierProductQuery, setDossierProductQuery] = useState('');
  const [documentQuery, setDocumentQuery] = useState('');
  const [unlinkedQuery, setUnlinkedQuery] = useState('');
  const [unlinkedSort, setUnlinkedSort] = useState<{
    field: 'code' | 'name' | 'category' | 'suggestion';
    direction: 'asc' | 'desc';
  }>({ field: 'code', direction: 'asc' });
  const [manualFamilyByProduct, setManualFamilyByProduct] = useState<Record<string, string>>({});
  const [manualLinkingProductId, setManualLinkingProductId] = useState('');
  const [unlinkedActionMessage, setUnlinkedActionMessage] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState<'all' | 'complete' | 'blocked' | 'attention'>('all');
  const [selectedPackagingSupplierKey, setSelectedPackagingSupplierKey] = useState('');
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [packagingDetailTab, setPackagingDetailTab] = useState<'basic' | 'profile' | 'purchased' | 'documents'>('basic');
  const [draftPackagingSupplier, setDraftPackagingSupplier] = useState<Supplier | null>(null);
  const [supplierDocumentMessage, setSupplierDocumentMessage] = useState('');
  const [draftFamily, setDraftFamily] = useState<ComplianceProductFamily | null>(null);
  const [draftRisks, setDraftRisks] = useState<ComplianceFamilyRisk[]>([]);
  const [draftWarnings, setDraftWarnings] = useState<ComplianceFamilyWarning[]>([]);
  const [draftDocuments, setDraftDocuments] = useState<ComplianceFamilyDocument[]>([]);
  const [draftRequirements, setDraftRequirements] = useState<ComplianceFamilyRequirement[]>([]);
  const [draftTestPlans, setDraftTestPlans] = useState<ComplianceFamilyTestPlan[]>([]);
  const [draftTests, setDraftTests] = useState<ComplianceProductTest[]>([]);
  const [draftRevisions, setDraftRevisions] = useState<ComplianceFamilyRevision[]>([]);
  const [draftLinks, setDraftLinks] = useState<ComplianceProductLink[]>([]);
  const [unlinkingLinkId, setUnlinkingLinkId] = useState('');
  const [linkActionMessage, setLinkActionMessage] = useState('');
  const familyDetailRef = useRef<HTMLElement | null>(null);
  const packagingDetailRef = useRef<HTMLElement | null>(null);
  const previousSelectedFamilyIdRef = useRef<string>('');

  useEffect(() => {
    if (!selectedFamilyId && families[0]?.id) {
      setSelectedFamilyId(families[0].id);
    }
  }, [families, selectedFamilyId]);

  useEffect(() => {
    const selectedFamily = families.find((family) => family.id === selectedFamilyId);
    if (!selectedFamily) return;
    setDraftFamily({ ...selectedFamily });
    setDraftRisks(risks.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));
    setDraftWarnings(warnings.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));
    setDraftDocuments(documents.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));
    setDraftRequirements(requirements.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));
    setDraftTestPlans(testPlans.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));
    setDraftTests(tests.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));
    setDraftRevisions(revisions.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })).sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? '')));
    setDraftLinks(links.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));

    if (previousSelectedFamilyIdRef.current !== selectedFamilyId) {
      setLinkPage(1);
      previousSelectedFamilyIdRef.current = selectedFamilyId;
    }
  }, [documents, families, links, requirements, revisions, risks, selectedFamilyId, testPlans, tests, warnings]);

  function openFamilyDetail(familyId: string, tab: ComplianceDetailTab = 'basic') {
    setModuleView('families');
    setSelectedFamilyId(familyId);
    setDetailTab(tab);
    if (tab === 'links') {
      setLinkSearch('');
      setLinkPage(1);
    }
    setFamilyDialogOpen(true);
  }

  const outsourcedProducts = useMemo(() => products.filter((product) => productIsOutsourced(product, suppliers)), [products, suppliers]);
  const outsourcedProductIds = useMemo(() => new Set(outsourcedProducts.map((product) => product.id)), [outsourcedProducts]);
  const dossierLinks = useMemo(() => links.filter((link) => !outsourcedProductIds.has(link.productId)), [links, outsourcedProductIds]);
  const familyRows = useMemo(() => families.map((family) => ({
    family,
    stats: getComplianceFamilyStats(family, risks, warnings, documents, requirements, testPlans, tests, dossierLinks, products),
  })), [documents, families, dossierLinks, products, requirements, risks, testPlans, tests, warnings]);

  const filteredFamilies = useMemo(() => familyRows
    .filter(({ family, stats }) => {
      const haystack = `${family.code} ${family.name} ${family.category ?? ''}`.toLowerCase();
      const matchesQuery = haystack.includes(familyQuery.toLowerCase());
      const matchesCategory = familyCategoryFilter === 'all' || (family.category || '') === familyCategoryFilter;
      const matchesStatus = familyStatusFilter === 'all' || (stats.calculatedStatus || 'concept') === familyStatusFilter;
      return matchesQuery && matchesCategory && matchesStatus;
    })
    .sort((left, right) => left.family.name.localeCompare(right.family.name, 'nl', { sensitivity: 'base' })),
  [familyCategoryFilter, familyQuery, familyRows, familyStatusFilter]);

  const familyCategories = useMemo(() => Array.from(new Set(
    familyRows.map(({ family }) => family.category || '').filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, 'nl')), [familyRows]);

  const familyStatuses = useMemo(() => Array.from(new Set(
    familyRows.map(({ stats }) => stats.calculatedStatus || 'concept'),
  )), [familyRows]);

  const linkedProductIds = useMemo(() => new Set(
    links.filter((link) => (link.status ?? 'active') === 'active').map((link) => link.productId),
  ), [links]);

  const productsWithoutFamily = useMemo(() => products.filter((product) => {
    if (!product.id || linkedProductIds.has(product.id) || outsourcedProductIds.has(product.id)) return false;
    const haystack = `${product.code} ${product.description} ${product.articleGroup ?? ''} ${product.brand ?? ''}`.toLowerCase();
    return haystack.includes(unlinkedQuery.toLowerCase());
  }), [linkedProductIds, outsourcedProductIds, products, unlinkedQuery]);

  const expiringDocuments = useMemo(() => documents.filter((document) => expiryState(document.validUntil) === 'soon'), [documents]);
  const expiredDocuments = useMemo(() => documents.filter((document) => expiryState(document.validUntil) === 'expired'), [documents]);
  const incompleteFamilies = useMemo(() => familyRows.filter((row) => row.stats.calculatedStatus !== 'complete' && row.stats.calculatedStatus !== 'not_applicable'), [familyRows]);
  const highRiskFamilies = useMemo(() => familyRows.filter((row) => row.family.riskLevel === 'high' || row.family.riskLevel === 'critical'), [familyRows]);
  const familiesWithOpenRequirements = useMemo(() => familyRows.filter((row) => row.stats.openRequirementCount > 0), [familyRows]);
  const familiesWithOpenTests = useMemo(() => familyRows.filter((row) => row.stats.openTestPlanCount > 0), [familyRows]);
  const familiesMissingDocuments = useMemo(() => familyRows.filter((row) => row.family.gpsrRequired !== false && row.stats.documentCount === 0), [familyRows]);

  const totals = useMemo(() => familyRows.reduce((summary, row) => {
    summary.families += 1;
    summary.linkedProducts += row.stats.activeLinks;
    summary.complete += row.stats.calculatedStatus === 'complete' ? 1 : 0;
    summary.incomplete += row.stats.calculatedStatus !== 'complete' && row.stats.calculatedStatus !== 'not_applicable' ? 1 : 0;
    return summary;
  }, {
    families: 0,
    linkedProducts: 0,
    complete: 0,
    incomplete: 0,
  }), [familyRows]);

  const templateSummary = buildComplianceTemplateSeed();

  const unlinkedSuggestions = useMemo(() => buildSuggestedComplianceLinks(products, families, links), [families, links, products]);

  const packagingSupplierUsageRows = useMemo(() => {
    const usage = new Map<string, {
      key: string;
      name: string;
      productIds: Set<string>;
      products: Product[];
      materials: Set<string>;
      layers: number;
    }>();

    products.forEach((product) => {
      const packagingLayers = Array.isArray(product.packagingLayers) ? product.packagingLayers : [];
      packagingLayers.forEach((layer) => {
        const name = layer.packagingSupplier?.trim();
        if (!name) return;
        const key = normalizeSupplierName(name);
        if (!key) return;
        const row = usage.get(key) ?? {
          key,
          name,
          productIds: new Set<string>(),
          products: [],
          materials: new Set<string>(),
          layers: 0,
        };
        if (product.id && !row.productIds.has(product.id)) {
          row.productIds.add(product.id);
          row.products.push(product);
        }
        if (layer.material?.trim()) {
          row.materials.add(layer.material.trim());
        }
        row.layers += 1;
        usage.set(key, row);
      });
    });

    return Array.from(usage.values()).sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
  }, [products]);

  const allPackagingSupplierRows = useMemo<Array<{
    key: string;
    supplier?: Supplier;
    usage?: {
      key: string;
      name: string;
      productIds: Set<string>;
      products: Product[];
      materials: Set<string>;
      layers: number;
    };
    isReady: boolean;
  }>>(() => {
    const usageMap = new Map(packagingSupplierUsageRows.map((row) => [row.key, row]));
    const rows: Array<{
      key: string;
      supplier?: Supplier;
      usage?: {
        key: string;
        name: string;
        productIds: Set<string>;
        products: Product[];
        materials: Set<string>;
        layers: number;
      };
      isReady: boolean;
    }> = suppliers
      .filter((supplier) => supplier.isPackagingSupplier === true || usageMap.has(normalizeSupplierName(supplier.name)))
      .map((rawSupplier) => {
        const supplier = migrateSupplierPpwr(rawSupplier);
        const key = normalizeSupplierName(supplier.name) || supplier.id;
        const usage = usageMap.get(key);
        return {
          key: supplier.id,
          supplier,
          usage,
          isReady: packagingSupplierProfileReady(supplier),
        };
      });

    packagingSupplierUsageRows.forEach((usage) => {
      if (rows.some((row) => normalizeSupplierName(row.supplier?.name) === usage.key)) return;
      rows.push({
        key: `usage-${usage.key}`,
        supplier: undefined,
        usage,
        isReady: false,
      });
    });

    return rows.sort((left, right) => {
        const leftReady = Number(left.isReady);
        const rightReady = Number(right.isReady);
        if (rightReady !== leftReady) return rightReady - leftReady;
        const leftUsage = left.usage?.products.length ?? 0;
        const rightUsage = right.usage?.products.length ?? 0;
        if (rightUsage !== leftUsage) return rightUsage - leftUsage;
        return (left.supplier?.name ?? left.usage?.name ?? '').localeCompare((right.supplier?.name ?? right.usage?.name ?? ''), 'nl', { sensitivity: 'base' });
      });
  }, [packagingSupplierUsageRows, suppliers]);

  const packagingSupplierRows = useMemo(() => allPackagingSupplierRows.filter((row) => {
    const needle = supplierQuery.trim().toLowerCase();
    const profileMaterials = row.supplier?.packagingProfile?.map((layer) => `${layer.naam ?? ''} ${layer.materiaalcode}`).join(' ') ?? '';
    const haystack = `${row.supplier?.name ?? row.usage?.name ?? ''} ${profileMaterials} ${Array.from(row.usage?.materials ?? []).join(' ')}`.toLowerCase();
    const status = ppwrSupplierStatus(row.supplier);
    const matchesStatus = supplierStatusFilter === 'all'
      || (supplierStatusFilter === 'complete' && status === 'compleet')
      || (supplierStatusFilter === 'blocked' && status === 'geblokkeerd')
      || (supplierStatusFilter === 'attention' && status === 'aanvullen');
    return (!needle || haystack.includes(needle)) && matchesStatus;
  }), [allPackagingSupplierRows, supplierQuery, supplierStatusFilter]);

  const packagingSupplierTotals = useMemo(() => allPackagingSupplierRows.reduce((summary, row) => {
    summary.total += 1;
    if (row.supplier) summary.linked += 1;
    if (row.isReady) summary.ready += 1;
    if (ppwrSupplierStatus(row.supplier) === 'geblokkeerd') summary.blocked += 1;
    if (!row.supplier) summary.missing += 1;
    return summary;
  }, {
    total: 0,
    linked: 0,
    ready: 0,
    missing: 0,
    blocked: 0,
  }), [allPackagingSupplierRows]);

  useEffect(() => {
    requestAnimationFrame(() => packagingDetailRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  }, [selectedPackagingSupplierKey]);

  useEffect(() => {
    if (!selectedPackagingSupplierKey && packagingSupplierRows[0]?.key) {
      setSelectedPackagingSupplierKey(packagingSupplierRows[0].key);
    }
  }, [packagingSupplierRows, selectedPackagingSupplierKey]);

  useEffect(() => {
    const selectedRow = allPackagingSupplierRows.find((row) => row.key === selectedPackagingSupplierKey);
    if (!selectedRow) return;
    if (selectedRow.supplier) {
      setDraftPackagingSupplier({ ...migrateSupplierPpwr(selectedRow.supplier) });
      return;
    }
    setDraftPackagingSupplier({
      id: createComplianceEntityId('packaging-supplier'),
      name: selectedRow.usage?.name ?? '',
      isPackagingSupplier: true,
      active: true,
      supplierSchemaVersion: 2,
      herkomst: 'niet_eu',
      ppwrSupplierRole: 'productleverancier_niet_eu',
      packagingProfile: [],
    });
  }, [allPackagingSupplierRows, selectedPackagingSupplierKey]);

  const selectedFamilyProducts = useMemo(() => {
    const activeLinks = draftLinks.filter((link) => (link.status ?? 'active') === 'active');
    return activeLinks.map((link) => ({
      link,
      product: products.find((product) => product.id === link.productId),
    }));
  }, [draftLinks, products]);

  const familyBatchOptions = useMemo(() => {
    const batches = new Map<string, Set<string>>();
    selectedFamilyProducts.forEach(({ product }) => {
      if (!product) return;
      const batch = product.batchNumber?.trim() || product.batch?.trim() || product.traceabilityCode?.trim();
      if (!batch) return;
      const productCodes = batches.get(batch) ?? new Set<string>();
      if (product.code?.trim()) productCodes.add(product.code.trim());
      batches.set(batch, productCodes);
    });
    return Array.from(batches.entries())
      .map(([value, productCodes]) => ({ value, label: Array.from(productCodes).join(', ') }))
      .sort((left, right) => left.value.localeCompare(right.value, 'nl', { numeric: true, sensitivity: 'base' }));
  }, [selectedFamilyProducts]);

  const linkedSupplierDetails = useMemo(() => {
    const byName = new Map<string, { name: string; supplier?: Supplier; products: Product[] }>();
    selectedFamilyProducts.forEach(({ product }) => {
      if (!product) return;
      const name = product.supplier?.trim() || product.manufacturerName?.trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('nl');
      const current = byName.get(key) ?? {
        name,
        supplier: suppliers.find((item) => item.name.trim().toLocaleLowerCase('nl') === key),
        products: [],
      };
      current.products.push(product);
      byName.set(key, current);
    });
    return Array.from(byName.values()).map((entry) => ({
      ...entry,
      importer: entry.supplier?.importerId ? importers.find((item) => item.id === entry.supplier?.importerId) : undefined,
      euResponsiblePerson: entry.supplier?.euResponsiblePersonId ? importers.find((item) => item.id === entry.supplier?.euResponsiblePersonId) : undefined,
    }));
  }, [importers, selectedFamilyProducts, suppliers]);

  const filteredFamilyProducts = useMemo(() => selectedFamilyProducts.filter(({ product, link }) => {
    const haystack = `${product?.code ?? ''} ${product?.description ?? ''} ${product?.articleGroup ?? ''} ${link.variantDescription ?? ''}`.toLowerCase();
    return haystack.includes(linkSearch.toLowerCase());
  }), [linkSearch, selectedFamilyProducts]);

  const linkedProductsPageSize = 10;
  const linkedProductsPageCount = Math.max(1, Math.ceil(filteredFamilyProducts.length / linkedProductsPageSize));
  const pagedLinkedProducts = filteredFamilyProducts.slice((linkPage - 1) * linkedProductsPageSize, linkPage * linkedProductsPageSize);

  const searchableUnlinkedProducts = useMemo(() => {
    const activeIds = new Set(draftLinks.filter((link) => (link.status ?? 'active') === 'active').map((link) => link.productId));
    return products.filter((product) => {
      if (!product.id || activeIds.has(product.id)) return false;
      const haystack = `${product.code} ${product.description} ${product.articleGroup ?? ''}`.toLowerCase();
      return haystack.includes(productSearch.toLowerCase());
    }).slice(0, 12);
  }, [draftLinks, productSearch, products]);

  const documentsWithFamily = useMemo(() => documents
    .map((document) => ({
      document,
      family: families.find((family) => family.id === document.familyId),
    }))
    .filter(({ document, family }) => {
      const haystack = `${document.documentName} ${document.documentType ?? ''} ${family?.name ?? ''} ${family?.code ?? ''}`.toLowerCase();
      return haystack.includes(documentQuery.toLowerCase());
    })
    .sort((left, right) => {
      const leftState = expiryState(left.document.validUntil);
      const rightState = expiryState(right.document.validUntil);
      const priority = { expired: 0, soon: 1, ok: 2, none: 3 } as const;
      return priority[leftState] - priority[rightState];
    }), [documentQuery, documents, families]);

  async function handleSeedTemplates() {
    setSaving(true);
    try {
      await onSeedTemplates(templateSummary);
      setModuleView('families');
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoLink() {
    setSaving(true);
    try {
      await onAutoLinkProducts(unlinkedSuggestions);
      setModuleView('unlinked');
    } finally {
      setSaving(false);
    }
  }

  async function handleManualProductLink(product: Product) {
    const familyId = manualFamilyByProduct[product.id];
    const family = families.find((item) => item.id === familyId);
    if (!product.id || !family) return;

    const timestamp = new Date().toISOString();
    const existingLink = links.find((link) => link.productId === product.id && (link.status ?? 'active') !== 'active');
    const activatedLink: ComplianceProductLink = {
      ...existingLink,
      id: existingLink?.id || createComplianceEntityId('compliance-link'),
      familyId: family.id,
      productId: product.id,
      variantDescription: product.articleGroup || '',
      status: 'active',
      linkedBy: 'handmatig vanuit producten zonder familie',
      createdAt: existingLink?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const revision: ComplianceFamilyRevision = {
      id: createComplianceEntityId('compliance-revision'),
      familyId: family.id,
      changeNote: `Product gekoppeld (${product.code || product.id})`,
      changedBy: 'handmatig',
      createdAt: timestamp,
    };

    setManualLinkingProductId(product.id);
    setUnlinkedActionMessage('');
    try {
      await onActivateProductLink(activatedLink, revision);
      setManualFamilyByProduct((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      setUnlinkedActionMessage(`${product.code || 'Product'} is gekoppeld aan ${family.code} - ${family.name}.`);
    } catch (error) {
      setUnlinkedActionMessage(`Koppelen mislukt: ${error instanceof Error ? error.message : 'onbekende fout'}`);
    } finally {
      setManualLinkingProductId('');
    }
  }

  function createNewFamily() {
    const familyId = createComplianceEntityId('compliance-family');
    setModuleView('families');
    setSelectedFamilyId(familyId);
    setFamilyDialogOpen(true);
    setDetailTab('basic');
    setDraftFamily({
      id: familyId,
      code: '',
      name: '',
      category: '',
      description: '',
      intendedUse: '',
      foreseeableMisuse: '',
      riskLevel: 'medium',
      gpsrRequired: true,
      status: 'concept',
      notes: '',
      noWarningsNeeded: false,
      manualText: '',
      manufacturerName: '',
      manufacturerContact: '',
    });
    setDraftRisks([]);
    setDraftWarnings([]);
    setDraftDocuments([]);
    setDraftRequirements([]);
    setDraftTestPlans([]);
    setDraftTests([]);
    setDraftRevisions([]);
    setDraftLinks([]);
  }

  function addRisk() {
    if (!draftFamily) return;
    setDraftRisks((current) => [...current, {
      id: createComplianceEntityId('compliance-risk'),
      familyId: draftFamily.id,
      hazard: '',
      riskDescription: '',
      severity: '3',
      probability: '3',
      mitigation: '',
      residualRisk: '2',
    }]);
  }

  function addWarning() {
    if (!draftFamily) return;
    setDraftWarnings((current) => [...current, {
      id: createComplianceEntityId('compliance-warning'),
      familyId: draftFamily.id,
      warningType: 'general',
      warningTextNl: '',
      warningTextEn: '',
      requiredOnLabel: false,
      requiredInManual: true,
    }]);
  }

  function addDocument() {
    if (!draftFamily) return;
    setDraftDocuments((current) => [...current, {
      id: createComplianceEntityId('compliance-document'),
      familyId: draftFamily.id,
      documentType: 'manual',
      documentName: '',
      fileUrl: '',
      validFrom: '',
      validUntil: '',
      status: 'active',
    }]);
  }

  function addRequirement() {
    if (!draftFamily) return;
    setDraftRequirements((current) => [...current, {
      id: createComplianceEntityId('compliance-requirement'),
      familyId: draftFamily.id,
      name: '',
      regulation: '',
      mandatory: true,
      notes: '',
    }]);
  }

  function addTestPlan() {
    if (!draftFamily) return;
    setDraftTestPlans((current) => [...current, {
      id: createComplianceEntityId('compliance-test-plan'),
      familyId: draftFamily.id,
      name: '',
      method: '',
      frequency: '',
      mandatory: true,
    }]);
  }

  function addTest(planId?: string) {
    if (!draftFamily) return;
    setDraftTests((current) => [{
      id: createComplianceEntityId('compliance-test'),
      familyId: draftFamily.id,
      planId,
      testName: '',
      testDate: new Date().toISOString().slice(0, 10),
      result: 'pass',
      findings: '',
      correctiveAction: '',
      testedBy: '',
      batchRef: familyBatchOptions.length === 1 ? familyBatchOptions[0].value : '',
    }, ...current]);
  }

  function addRevision(note = 'Familiegegevens bijgewerkt') {
    if (!draftFamily) return;
    setDraftRevisions((current) => [{
      id: createComplianceEntityId('compliance-revision'),
      familyId: draftFamily.id,
      changeNote: note,
      createdAt: new Date().toISOString(),
    }, ...current]);
  }

  async function addProductLink(product: Product) {
    if (!draftFamily || !product.id) return;
    if (draftLinks.some((link) => link.productId === product.id && (link.status ?? 'active') === 'active')) return;

    const timestamp = new Date().toISOString();
    const existingLink = draftLinks.find((link) => link.productId === product.id);
    const activatedLink: ComplianceProductLink = {
      ...existingLink,
      id: existingLink?.id || createComplianceEntityId('compliance-link'),
      familyId: draftFamily.id,
      productId: product.id,
      variantDescription: product.articleGroup || '',
      status: 'active',
      linkedBy: 'handmatig',
      createdAt: existingLink?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const revision: ComplianceFamilyRevision = {
      id: createComplianceEntityId('compliance-revision'),
      familyId: draftFamily.id,
      changeNote: `Product gekoppeld (${product.code || product.id})`,
      createdAt: timestamp,
    };
    const nextLinks = existingLink
      ? draftLinks.map((link) => link.id === existingLink.id ? activatedLink : link)
      : [...draftLinks, activatedLink];

    setDraftLinks(nextLinks);
    setDraftRevisions((current) => [revision, ...current]);
    setProductSearch('');
    setLinkActionMessage('');
    try {
      await onActivateProductLink(activatedLink, revision);
      setLinkActionMessage('Product is gekoppeld en opgeslagen.');
    } catch (error) {
      setDraftLinks(draftLinks);
      setDraftRevisions((current) => current.filter((item) => item.id !== revision.id));
      setLinkActionMessage(`Koppelen mislukt: ${error instanceof Error ? error.message : 'onbekende fout'}`);
    }
  }

  async function saveFamilyBundle(overrides?: {
    links?: ComplianceProductLink[];
    revisions?: ComplianceFamilyRevision[];
  }) {
    if (!draftFamily) return;
    setSaving(true);
    try {
      await onSaveFamilyBundle({
        family: draftFamily,
        risks: draftRisks,
        warnings: draftWarnings,
        documents: draftDocuments,
        requirements: draftRequirements,
        testPlans: draftTestPlans,
        tests: draftTests,
        revisions: overrides?.revisions ?? (draftRevisions.length > 0 ? draftRevisions : [{
          id: createComplianceEntityId('compliance-revision'),
          familyId: draftFamily.id,
          changeNote: 'Familie opgeslagen',
          createdAt: new Date().toISOString(),
        }]),
        links: overrides?.links ?? draftLinks,
      });
    } finally {
      setSaving(false);
    }
  }

  async function deactivateLink(linkId: string) {
    if (!draftFamily) return;

    const removedLink = draftLinks.find((link) => link.id === linkId);
    if (!removedLink || unlinkingLinkId) return;
    const timestamp = new Date().toISOString();
    const updatedLink: ComplianceProductLink = {
      ...removedLink,
      status: 'inactive',
      updatedAt: timestamp,
    };
    const revision: ComplianceFamilyRevision = {
      id: createComplianceEntityId('compliance-revision'),
      familyId: draftFamily.id,
      changeNote: removedLink?.productId ? `Product ontkoppeld (${removedLink.productId})` : 'Product ontkoppeld',
      createdAt: timestamp,
    };

    setUnlinkingLinkId(linkId);
    setLinkActionMessage('');
    setDraftLinks((current) => current.map((link) => link.id === linkId ? updatedLink : link));
    setDraftRevisions((current) => [revision, ...current]);
    try {
      await onDeactivateProductLink(updatedLink, revision);
      setLinkActionMessage('Product is ontkoppeld.');
    } catch (error) {
      setDraftLinks((current) => current.map((link) => link.id === linkId ? removedLink : link));
      setDraftRevisions((current) => current.filter((item) => item.id !== revision.id));
      setLinkActionMessage(`Ontkoppelen mislukt: ${error instanceof Error ? error.message : 'onbekende fout'}`);
    } finally {
      setUnlinkingLinkId('');
    }
  }

  function requestDossierPreview() {
    if (selectedFamilyProducts.length === 0) {
      setDetailTab('links');
      setLinkActionMessage('Koppel eerst minimaal één product voordat je een dossier genereert.');
      return;
    }
    setDossierProductId('');
    setDossierProductQuery('');
    setDossierPickerOpen(true);
  }

  function openDossierPreview(selectedProductId: string) {
    if (!draftFamily) return;
    const selectedDossierEntry = selectedFamilyProducts.find(({ product, link }) => (product?.id || link.productId) === selectedProductId);
    if (!selectedDossierEntry) return;
    const selectedDossierProduct = selectedDossierEntry.product;
    const selectedSupplier = selectedDossierProduct?.supplier
      ? suppliers.find((supplier) => normalizeSupplierName(supplier.name) === normalizeSupplierName(selectedDossierProduct.supplier))
      : undefined;
    const selectedImporter = selectedSupplier?.importerId ? importers.find((importer) => importer.id === selectedSupplier.importerId) : undefined;
    const selectedEuResponsiblePerson = selectedSupplier?.euResponsiblePersonId ? importers.find((importer) => importer.id === selectedSupplier.euResponsiblePersonId) : undefined;
    const economicOperatorRows = [
      {
        role: 'Fabrikant / leverancier',
        name: selectedSupplier?.name || selectedDossierProduct?.manufacturerName || selectedDossierProduct?.supplier,
        address: selectedSupplier
          ? [selectedSupplier.address, selectedSupplier.postalCode, selectedSupplier.city, selectedSupplier.country].filter(Boolean).join(', ')
          : [selectedDossierProduct?.manufacturerAddress, selectedDossierProduct?.manufacturerPostalCode, selectedDossierProduct?.manufacturerCity, selectedDossierProduct?.manufacturerCountry].filter(Boolean).join(', '),
        email: selectedSupplier?.email || selectedDossierProduct?.manufacturerEmail,
        website: selectedSupplier?.website || selectedDossierProduct?.manufacturerWebsite,
      },
      {
        role: 'Importeur',
        name: selectedImporter?.name || selectedDossierProduct?.importerName,
        address: selectedImporter
          ? [selectedImporter.address, selectedImporter.postalCode, selectedImporter.city, selectedImporter.country].filter(Boolean).join(', ')
          : [selectedDossierProduct?.importerAddress, selectedDossierProduct?.importerPostalCode, selectedDossierProduct?.importerCity, selectedDossierProduct?.importerCountry].filter(Boolean).join(', '),
        email: selectedImporter?.email || selectedDossierProduct?.importerEmail,
        website: selectedImporter?.website || selectedDossierProduct?.importerWebsite,
      },
      {
        role: 'EU-verantwoordelijke persoon',
        name: selectedEuResponsiblePerson?.name || selectedDossierProduct?.euResponsiblePersonName,
        address: selectedEuResponsiblePerson
          ? [selectedEuResponsiblePerson.address, selectedEuResponsiblePerson.postalCode, selectedEuResponsiblePerson.city, selectedEuResponsiblePerson.country].filter(Boolean).join(', ')
          : [selectedDossierProduct?.euResponsiblePersonAddress, selectedDossierProduct?.euResponsiblePersonPostalCode, selectedDossierProduct?.euResponsiblePersonCity, selectedDossierProduct?.euResponsiblePersonCountry].filter(Boolean).join(', '),
        email: selectedEuResponsiblePerson?.email || selectedDossierProduct?.euResponsiblePersonEmail,
        website: selectedEuResponsiblePerson?.website || selectedDossierProduct?.euResponsiblePersonWebsite,
      },
    ];
    const economicOperatorHtml = economicOperatorRows.map((operator) => `
      <tr>
        <td><strong>${escapeHtml(operator.role)}</strong></td>
        <td>${escapeHtml(operator.name || '-')}</td>
        <td>${escapeHtml(operator.address || '-')}</td>
        <td>${escapeHtml(operator.email || '-')}</td>
        <td>${escapeHtml(operator.website || '-')}</td>
      </tr>
    `).join('');
    const normalizeVehicleModel = (value?: string) => {
      const normalized = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalized === 'S9' || normalized.includes('SPEEDY')) return 'SPEEDY';
      return normalized;
    };
    const linkedProductModelText = [selectedDossierEntry]
      .map(({ product, link }) => [product?.description, product?.shortDescription, product?.labelTitle, product?.articleGroup, link.variantDescription].filter(Boolean).join(' '))
      .join(' ');
    const normalizedLinkedProductText = normalizeVehicleModel(linkedProductModelText);
    const mentionedVehicleModels = Array.from(new Set(scooters
      .map((scooter) => normalizeVehicleModel(scooter.model))
      .filter((model) => model && normalizedLinkedProductText.includes(model))));
    if ((normalizedLinkedProductText.includes('S9') || normalizedLinkedProductText.includes('SPEEDY')) && !mentionedVehicleModels.includes('SPEEDY')) {
      mentionedVehicleModels.push('SPEEDY');
    }
    const vehicleApprovalRows = mentionedVehicleModels.flatMap((model) => {
      const matchingScooters = scooters.filter((scooter) => normalizeVehicleModel(scooter.model) === model && Boolean(scooter.rdwTypeApprovalNumber?.trim()));
      const approvals = new Map<string, Scooter>();
      matchingScooters.forEach((scooter) => {
        const key = [scooter.rdwTypeApprovalNumber || 'ONTBREEKT', scooter.rdwType || '', scooter.rdwVariant || '', scooter.rdwExecution || ''].join('|');
        if (!approvals.has(key)) approvals.set(key, scooter);
      });
      if (approvals.size === 0) return [];
      return Array.from(approvals.values()).map((scooter) => ({ model, scooter }));
    });
    const vehicleApprovalHtml = vehicleApprovalRows.map(({ model, scooter }) => `
      <tr>
        <td>RSO ${escapeHtml(model === 'SPEEDY' ? 'Speedy / S9' : model)}</td>
        <td>${escapeHtml(scooter?.rdwTypeApprovalNumber || '')}</td>
        <td>${escapeHtml(scooter?.rdwType || '-')}</td>
        <td>${escapeHtml(scooter?.rdwVariant || '-')}</td>
        <td>${escapeHtml(scooter?.rdwExecution || '-')}</td>
      </tr>
    `).join('');
    const riskRows = draftRisks.map((risk) => {
      const score = asNumber(risk.severity) * asNumber(risk.probability);
      return `<tr>
        <td>${escapeHtml(risk.hazard)}</td>
        <td>${escapeHtml(risk.riskDescription || '-')}</td>
        <td>${escapeHtml(risk.severity)}</td>
        <td>${escapeHtml(risk.probability)}</td>
        <td>${score}</td>
        <td>${escapeHtml(risk.mitigation)}</td>
        <td>${escapeHtml(risk.residualRisk)}</td>
      </tr>`;
    }).join('');
    const warningCards = draftWarnings.map((warning) => `
      <div class="warning-card">
        <strong>[${escapeHtml(warning.warningType || 'general')}]</strong><br />
        <strong>NL:</strong> ${escapeHtml(warning.warningTextNl)}<br />
        ${warning.warningTextEn ? `<strong>EN:</strong> ${escapeHtml(warning.warningTextEn)}` : ''}
      </div>
    `).join('');
    const documentRows = draftDocuments.map((document) => `
      <tr>
        <td>${escapeHtml(document.documentType || '-')}</td>
        <td>${escapeHtml(document.documentName)}</td>
        <td>${escapeHtml(formatDate(document.validUntil))}</td>
      </tr>
    `).join('');
    const productIdentificationRows = [
      ['Artikelnummer', selectedDossierProduct?.code || selectedDossierEntry.link.productId],
      ['Productnaam / omschrijving', selectedDossierProduct?.labelTitle || selectedDossierProduct?.description],
      ['Merk', selectedDossierProduct?.brand],
      ['Leveranciersartikelnummer', selectedDossierProduct?.supplierItemNo],
      ['EAN / barcode', selectedDossierProduct?.barcode],
      ['Batch- of lotnummer', selectedDossierProduct?.batchNumber || selectedDossierProduct?.batch],
      ['Serienummer', selectedDossierProduct?.serialNumber],
      ['Traceerbaarheidscode', selectedDossierProduct?.traceabilityCode],
      ['Land van oorsprong', selectedDossierProduct?.countryOfOrigin],
      ['Productcategorie', selectedDossierProduct?.articleGroup || draftFamily.category],
    ].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || 'Niet vastgelegd')}</td></tr>`).join('');
    const characteristicRows = [
      ['Essentiële veiligheidskenmerken', selectedDossierProduct?.safetyInfo],
      ['Productwaarschuwing', selectedDossierProduct?.warning],
      ['Verpakkings-/verkoopeenheid', selectedDossierProduct?.packagingUnit],
      ['Primaire verpakkingsmateriaal', selectedDossierProduct?.packagingMaterialPrimary],
      ['Secundaire verpakkingsmateriaal', selectedDossierProduct?.packagingMaterialSecondary],
      ['Materiaal / samenstelling van het product', undefined],
    ].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || 'Niet vastgelegd')}</td></tr>`).join('');
    const requirementRows = draftRequirements.map((requirement) => `
      <tr><td>${escapeHtml(requirement.name)}</td><td>${escapeHtml(requirement.regulation || '-')}</td><td>${requirement.mandatory ?? true ? 'Verplicht' : 'Aanvullend'}</td><td>${requirementFulfilled(requirement, draftDocuments) ? 'Aangetoond' : 'Openstaand'}</td><td>${escapeHtml(requirement.notes || '-')}</td></tr>
    `).join('');
    const testRows = draftTests.map((test) => {
      const plan = draftTestPlans.find((item) => item.id === test.planId);
      return `<tr><td>${escapeHtml(test.testName || plan?.name || '-')}</td><td>${escapeHtml(formatDate(test.testDate))}</td><td>${escapeHtml(test.batchRef || '-')}</td><td>${escapeHtml(test.result || '-')}</td><td>${escapeHtml(test.testedBy || '-')}</td><td>${escapeHtml(test.findings || '-')}</td></tr>`;
    }).join('');
    const dossierRevisions = draftRevisions
      .filter((revision) => !/^Product (?:ge|ont)koppeld\b/i.test(revision.changeNote.trim()))
      .slice(0, 5);
    const revisionRows = dossierRevisions.map((revision) => `<tr><td>${escapeHtml(formatDate(revision.createdAt))}</td><td>${escapeHtml(revision.changedBy || '-')}</td><td>${escapeHtml(revision.changeNote)}</td></tr>`).join('');
    const dossierGaps = [
      !selectedDossierProduct?.brand && 'merk',
      !(selectedDossierProduct?.barcode || selectedDossierProduct?.batchNumber || selectedDossierProduct?.batch || selectedDossierProduct?.serialNumber || selectedDossierProduct?.traceabilityCode) && 'traceerbaar productkenmerk',
      !economicOperatorRows[0].name && 'fabrikant',
      !selectedDossierProduct?.safetyInfo && 'essentiële veiligheidskenmerken',
      draftRisks.length === 0 && 'risicoanalyse',
      draftRequirements.length === 0 && 'toepasselijke wetgeving/normen',
      draftTests.length === 0 && 'test- of keuringsbewijs',
    ].filter(Boolean) as string[];
    const dossierRecommendations = [
      !selectedDossierProduct?.imageUrl && 'productafbeelding',
    ].filter(Boolean) as string[];

    const previewWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!previewWindow) return;
    previewWindow.document.open();
    previewWindow.document.write(`
      <html>
        <head>
          <title>GPSR Technisch Dossier</title>
          <style>
            @page { size: A4 portrait; margin: 12mm 11mm 14mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #0f172a; font-size: 9px; line-height: 1.3; }
            h1, h2, h3 { color: #0b4a8f; break-after: avoid; page-break-after: avoid; }
            h1 { font-size: 18px; margin: 0 0 6px; }
            h2 { font-size: 11.5px; margin: 0 0 4px; }
            h3 { font-size: 9.5px; margin: 7px 0 3px; }
            p { margin: 3px 0 5px; }
            .hero { border: 1px solid #1d4f91; background: #eef4ff; padding: 8px; margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
            .hero-grid { width: 100%; border-collapse: collapse; margin-top: 5px; }
            .hero-grid td { padding: 3px 5px; border-bottom: 1px solid #dbe6f5; }
            .section { margin-top: 9px; }
            .keep-together { break-inside: avoid; page-break-inside: avoid; }
            table { width: 100%; border-collapse: collapse; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th, td { border: 1px solid #d6dce2; padding: 3px 4px; text-align: left; vertical-align: top; font-size: 8.5px; line-height: 1.22; }
            th { background: #103f77; color: white; }
            .warning-card { border: 1px solid #f5c451; background: #fff7da; padding: 5px; margin-bottom: 4px; break-inside: avoid; }
            .legal-note { border-left: 3px solid #1d4f91; background: #eef4ff; padding: 5px 7px; line-height: 1.3; }
            .gap-note { border-left: 3px solid #d97706; background: #fff7ed; padding: 5px 7px; line-height: 1.3; }
            .product-image { max-width: 220px; max-height: 150px; object-fit: contain; border: 1px solid #d6dce2; padding: 5px; }
            .print-button { float: right; background: #0b4a8f; color: white; border: 0; border-radius: 6px; padding: 10px 14px; cursor: pointer; }
            @media print {
              body { padding: 0; }
              .print-button { display: none; }
            }
          </style>
        </head>
        <body>
          <button class="print-button" onclick="window.print()">Afdrukken / PDF</button>
          <div class="hero">
            <h1>GPSR Technisch Dossier</h1>
            <table class="hero-grid">
              <tr><td><strong>Productfamilie</strong></td><td>${escapeHtml(draftFamily.name)}</td><td><strong>Code</strong></td><td>${escapeHtml(draftFamily.code)}</td></tr>
              <tr><td><strong>Categorie</strong></td><td>${escapeHtml(draftFamily.category || '-')}</td><td><strong>Risiconiveau</strong></td><td>${escapeHtml(riskLabel(draftFamily.riskLevel))}</td></tr>
              <tr><td><strong>Datum gegenereerd</strong></td><td>${escapeHtml(formatDate(new Date().toISOString()))}</td><td><strong>Artikelnummer</strong></td><td>${escapeHtml(selectedDossierProduct?.code || selectedDossierEntry.link.productId)}</td></tr>
            </table>
          </div>
          <div class="section"><h2>1. Dossiercontrole</h2><div class="gap-note">${dossierGaps.length ? `<strong>Nog aan te vullen:</strong> ${escapeHtml(dossierGaps.join(', '))}.` : '<strong>Geen inhoudelijke leemtes gevonden in de gecontroleerde kernvelden.</strong>'}${dossierRecommendations.length ? `<br /><strong>Aanbevolen aanvulling:</strong> ${escapeHtml(dossierRecommendations.join(', '))}.` : ''}<br /><small>De aanwezigheid van een veld is gecontroleerd; dit is geen inhoudelijke conformiteitsbeoordeling.</small></div></div>
          <div class="section"><h2>2. Marktdeelnemers</h2><table><thead><tr><th>Rol</th><th>Bedrijfsnaam</th><th>Adres</th><th>E-mail</th><th>Website</th></tr></thead><tbody>${economicOperatorHtml}</tbody></table></div>
          <div class="section"><h2>3. Productomschrijving</h2><p>${escapeHtml(draftFamily.description || selectedDossierProduct?.shortDescription || '-')}</p>${selectedDossierProduct?.imageUrl ? `<img class="product-image" src="${escapeHtml(selectedDossierProduct.imageUrl)}" alt="Productafbeelding" />` : ''}</div>
          <div class="section"><h2>4. Productidentificatie en traceerbaarheid</h2><table><tbody>${productIdentificationRows}</tbody></table></div>
          <div class="section"><h2>5. Bedoeld gebruik</h2><p>${escapeHtml(draftFamily.intendedUse || '-')}</p><h3>Voorzienbaar verkeerd gebruik</h3><p>${escapeHtml(draftFamily.foreseeableMisuse || '-')}</p></div>
          <div class="section keep-together"><h2>6. Essentiële kenmerken en samenstelling</h2><table><tbody>${characteristicRows}</tbody></table></div>
          <div class="section"><h2>7. Risicoanalyse</h2><table><thead><tr><th>Gevaar</th><th>Risicobeschrijving</th><th>Ernst</th><th>Kans</th><th>Score</th><th>Mitigatie</th><th>Resterend risico</th></tr></thead><tbody>${riskRows || '<tr><td colspan="7">Geen risicoanalyse vastgelegd.</td></tr>'}</tbody></table></div>
          <div class="section"><h2>8. Waarschuwingen en instructies</h2>${warningCards || '<p>Geen waarschuwingen vastgelegd.</p>'}<h3>Handleidingstekst</h3><p>${escapeHtml(draftFamily.manualText || 'Niet vastgelegd')}</p></div>
          <div class="section">
            <h2>9. Voertuigtype en EU-typegoedkeuring</h2>
            <p class="legal-note">Dit product is een OEM-onderdeel voor voertuigen met de onderstaande EU-typegoedkeuring(en). Het is bestemd als vervangingsonderdeel binnen de goedgekeurde voertuigconfiguratie.</p>
            <table><thead><tr><th>Voertuigmodel</th><th>EU-typegoedkeuringsnummer</th><th>RDW type</th><th>Variant</th><th>Uitvoering</th></tr></thead><tbody>${vehicleApprovalHtml}</tbody></table>
          </div>
          <div class="section"><h2>10. Toepasselijke wetgeving, normen en keuringseisen</h2><table><thead><tr><th>Eis</th><th>Regeling / norm</th><th>Type</th><th>Status</th><th>Toelichting</th></tr></thead><tbody>${requirementRows || '<tr><td colspan="5">Geen eisen of normen geregistreerd.</td></tr>'}</tbody></table></div>
          <div class="section"><h2>11. Tests en conformiteitsbewijs</h2><table><thead><tr><th>Test</th><th>Datum</th><th>Batch</th><th>Resultaat</th><th>Getest door</th><th>Bevindingen</th></tr></thead><tbody>${testRows || '<tr><td colspan="6">Geen testresultaten geregistreerd.</td></tr>'}</tbody></table></div>
          <div class="section"><h2>12. Documenten</h2><table><thead><tr><th>Type</th><th>Naam</th><th>Geldig t/m</th></tr></thead><tbody>${documentRows || '<tr><td colspan="3">Geen documenten geregistreerd.</td></tr>'}</tbody></table></div>
          <div class="section"><h2>13. Revisiegeschiedenis</h2><table><thead><tr><th>Datum</th><th>Gewijzigd door</th><th>Wijziging</th></tr></thead><tbody>${revisionRows || '<tr><td colspan="3">Geen inhoudelijke dossierrevisies geregistreerd.</td></tr>'}</tbody></table><p class="legal-note">Houd dit technisch dossier actueel en bewaar het ten minste tien jaar nadat het product in de handel is gebracht.</p></div>
        </body>
      </html>
    `);
    previewWindow.document.close();
    try {
      previewWindow.history.replaceState({}, 'GPSR Technisch Dossier', '/gpsr-technisch-dossier');
    } catch {
      // De dossierweergave blijft bruikbaar wanneer de browser URL-wijzigingen blokkeert.
    }
    setDossierPickerOpen(false);
  }

  function renderDashboard() {
    const dashboardTabTitle = dashboardTabs.find((tab) => tab.id === dashboardTab)?.label || 'Incomplete dossiers';

    return (
      <div className="compliance-view-stack">
        <div className="compliance-stat-grid compliance-stat-grid-large compliance-dashboard-topcards">
          <article className="stat-card compliance-dashboard-card blue compliance-dashboard-hero-card">
            <span>Productfamilies</span>
            <strong>{totals.families}</strong>
          </article>
          <article className="stat-card compliance-dashboard-card green compliance-dashboard-hero-card">
            <span>Compleet GPSR-dossier</span>
            <strong>{totals.complete}</strong>
          </article>
          <article className="stat-card compliance-dashboard-card amber compliance-dashboard-hero-card">
            <span>Incompleet dossiers</span>
            <strong>{totals.incomplete}</strong>
          </article>
          <article className="stat-card compliance-dashboard-card red compliance-dashboard-hero-card">
            <span>Producten zonder familie</span>
            <strong>{productsWithoutFamily.length}</strong>
          </article>
          <article className="stat-card compliance-dashboard-card blue compliance-dashboard-hero-card">
            <span>Uitbesteed aan leverancier</span>
            <strong>{outsourcedProducts.length}</strong>
            <small>Niet als openstaand werk geteld</small>
          </article>
        </div>

        <section className="panel compliance-dashboard-panel compliance-dashboard-tabs-shell">
          <div className="compliance-panel-body compliance-dashboard-tab-panel">
            <div className="compliance-tabs compliance-tabs-compact">
              {dashboardTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={dashboardTab === tab.id ? 'active' : ''}
                  onClick={() => setDashboardTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel compliance-dashboard-panel">
          <div className="panel-title">{dashboardTabTitle}</div>
          <div className="compliance-panel-body compliance-dashboard-tab-panel">
            <div className="compliance-dashboard-table">
              {dashboardTab === 'incomplete' && (
                incompleteFamilies.length === 0 ? <p className="empty">Geen incomplete dossiers.</p> : incompleteFamilies.map(({ family, stats }) => (
                  <button type="button" key={family.id} className="compliance-dashboard-row" onClick={() => openFamilyDetail(family.id)}>
                    <strong>{family.name}</strong>
                    <div className="compliance-dashboard-row-progress">
                      <div className="compliance-mini-progress">
                        <div className="compliance-mini-progress-fill" style={{ width: `${stats.progress}%` }} />
                      </div>
                      <span>{stats.progress}%</span>
                    </div>
                    <span className="compliance-inline-status danger">{stats.activeLinks === 0 ? 'Gekoppelde producten' : 'Aanvullen'}</span>
                  </button>
                ))
              )}
              {dashboardTab === 'outsourced' && (
                outsourcedProducts.length === 0 ? <p className="empty">Geen uitbestede producten.</p> : outsourcedProducts.map((product) => (
                  <button type="button" key={product.id} className="compliance-dashboard-row" onClick={() => onSelectProduct(product, 'basic')}>
                    <div><strong>{product.code}</strong><span>{product.description}</span></div>
                    <span className="compliance-inline-status">{product.supplier || 'Geen leverancier'}</span>
                  </button>
                ))
              )}

              {dashboardTab === 'highRisk' && (
                highRiskFamilies.length === 0 ? <p className="empty">Geen hoog risico families.</p> : highRiskFamilies.map(({ family, stats }) => (
                  <button type="button" key={family.id} className="compliance-dashboard-row" onClick={() => openFamilyDetail(family.id)}>
                    <div className="compliance-dashboard-risk-main">
                      <strong>{family.name}</strong>
                      <div className="compliance-dashboard-risk-tags">
                        <span className="compliance-inline-status warning">{statusLabel(stats.calculatedStatus)}</span>
                      </div>
                    </div>
                    <span className={`compliance-badge danger`}>{riskLabel(family.riskLevel)}</span>
                  </button>
                ))
              )}

              {dashboardTab === 'requirements' && (
                familiesWithOpenRequirements.length === 0 ? <p className="empty">Alle verplichte keuringen zijn vervuld of nog niet vastgelegd.</p> : familiesWithOpenRequirements.map(({ family, stats }) => (
                  <button type="button" key={family.id} className="compliance-dashboard-row compliance-dashboard-row-wide" onClick={() => openFamilyDetail(family.id, 'requirements')}>
                    <strong>{family.name}</strong>
                    <span className="compliance-inline-status warning">{stats.openRequirementCount} open</span>
                  </button>
                ))
              )}

              {dashboardTab === 'tests' && (
                familiesWithOpenTests.length === 0 ? <p className="empty">Alle verplichte tests zijn uitgevoerd of nog niet vastgelegd.</p> : familiesWithOpenTests.map(({ family, stats }) => (
                  <button type="button" key={family.id} className="compliance-dashboard-row compliance-dashboard-row-wide" onClick={() => openFamilyDetail(family.id, 'tests')}>
                    <strong>{family.name}</strong>
                    <span className="compliance-inline-status warning">{stats.openTestPlanCount} open</span>
                  </button>
                ))
              )}

              {dashboardTab === 'missingDocuments' && (
                familiesMissingDocuments.length === 0 ? <p className="empty">Alle families hebben minimaal een document.</p> : familiesMissingDocuments.map(({ family }) => (
                  <button type="button" key={family.id} className="compliance-dashboard-row compliance-dashboard-row-wide" onClick={() => openFamilyDetail(family.id, 'documents')}>
                    <strong>{family.name}</strong>
                    <span className="compliance-inline-status danger">Geen actief document gekoppeld</span>
                  </button>
                ))
              )}

              {dashboardTab === 'expiringDocuments' && (
                expiringDocuments.length === 0 ? <p className="empty">Geen documenten verlopen binnen 60 dagen.</p> : expiringDocuments.map((document) => {
                  const family = families.find((item) => item.id === document.familyId);
                  return (
                    <button type="button" key={document.id} className="compliance-dashboard-row compliance-dashboard-row-wide" onClick={() => { setModuleView('documents'); setDocumentQuery(document.documentName); }}>
                      <strong>{family?.name || document.documentName}</strong>
                      <span className="compliance-inline-status warning">{formatDate(document.validUntil)}</span>
                    </button>
                  );
                })
              )}

              {dashboardTab === 'expiredDocuments' && (
                expiredDocuments.length === 0 ? <p className="empty">Geen verlopen documenten.</p> : expiredDocuments.map((document) => {
                  const family = families.find((item) => item.id === document.familyId);
                  return (
                    <button type="button" key={document.id} className="compliance-dashboard-row compliance-dashboard-row-wide" onClick={() => { setModuleView('documents'); setDocumentQuery(document.documentName); }}>
                      <strong>{family?.name || document.documentName}</strong>
                      <span className="compliance-inline-status danger">{formatDate(document.validUntil)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

      </div>
    );
  }

  function renderFamiliesView() {
    const selectedStats = draftFamily ? getComplianceFamilyStats(draftFamily, draftRisks, draftWarnings, draftDocuments, draftRequirements, draftTestPlans, draftTests, draftLinks, products) : null;

    return (
      <div className="compliance-view-stack">
        <section className="panel compliance-family-table-panel">
          <div className="panel-title compliance-family-table-header">
            <span className="panel-title-label">Productfamilies</span>
            <button type="button" className="primary-button" onClick={createNewFamily}><Plus size={14} /> Nieuwe familie</button>
          </div>
          <div className="compliance-family-table-toolbar">
            <div className="search-field">
              <Search size={16} />
              <input value={familyQuery} onChange={(event) => setFamilyQuery(event.target.value)} placeholder="Zoeken op naam of code..." />
            </div>
            <select value={familyCategoryFilter} onChange={(event) => setFamilyCategoryFilter(event.target.value)}>
              <option value="all">Alle categorieen</option>
              {familyCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={familyStatusFilter} onChange={(event) => setFamilyStatusFilter(event.target.value)}>
              <option value="all">Alle statussen</option>
              {familyStatuses.map((status) => <option key={status} value={status}>{familyDocumentationLabel(status)}</option>)}
            </select>
          </div>

          <div className="compliance-family-table-scroll">
            <table className="compliance-family-table">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Categorie</th>
                  <th>Risico</th>
                  <th>Producten</th>
                  <th>Status</th>
                  <th>Acties</th>
                </tr>
              </thead>
              <tbody>
                {filteredFamilies.map(({ family, stats }) => (
                  <tr key={family.id} className={selectedFamilyId === family.id ? 'active' : ''}>
                    <td>
                      <button type="button" className="compliance-family-link-button" onClick={() => openFamilyDetail(family.id)}>
                        {family.name}
                      </button>
                    </td>
                    <td>{family.category || '-'}</td>
                    <td>
                      <span className={`compliance-badge ${family.riskLevel === 'low' ? 'success' : family.riskLevel === 'medium' ? 'warning' : 'danger'}`}>
                        {riskLabel(family.riskLevel)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="compliance-product-count-button"
                        onClick={() => openFamilyDetail(family.id, 'links')}
                        aria-label={`Bekijk ${stats.activeLinks} gekoppelde producten van ${family.name}`}
                        title="Gekoppelde producten bekijken en ontkoppelen"
                      >
                        {stats.activeLinks}
                      </button>
                    </td>
                    <td>
                      <span className={`compliance-status-pill ${stats.calculatedStatus}`}>
                        {familyDocumentationLabel(stats.calculatedStatus)}
                      </span>
                    </td>
                    <td>
                      <div className="compliance-family-table-actions">
                        <button type="button" className="secondary-button" onClick={() => openFamilyDetail(family.id)}>Detail</button>
                        <button type="button" className="secondary-button" onClick={() => openFamilyDetail(family.id)}>Bewerken</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredFamilies.length === 0 ? (
                  <tr>
                    <td colSpan={6}><p className="empty">Geen productfamilies gevonden voor deze filters.</p></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {familyDialogOpen && draftFamily ? (
        <div className="modal-backdrop compliance-detail-dialog-backdrop" onMouseDown={() => setFamilyDialogOpen(false)}>
        <section className="panel compliance-family-detail compliance-detail-dialog product-family-dialog" ref={familyDetailRef} onMouseDown={(event) => event.stopPropagation()}>
          {!draftFamily ? (
            <p className="empty compliance-empty">Kies een productfamilie links of maak een nieuwe aan.</p>
          ) : (
            <>
              <div className="panel-title compliance-family-detail-header">
                <div>
                  <span className="compliance-breadcrumb">Productfamilies</span>
                  <h2>{draftFamily.name || 'Nieuwe productfamilie'} <small>{draftFamily.code || 'Nieuw'}</small></h2>
                </div>
                <div className="page-title-actions">
                  <button type="button" className="secondary-button" onClick={() => setFamilyDialogOpen(false)}>Sluiten</button>
                  <button type="button" className="secondary-button" onClick={() => void saveFamilyBundle()} disabled={saving}>Opslaan</button>
                  <button type="button" className="primary-button" onClick={requestDossierPreview}>Dossier genereren</button>
                </div>
              </div>

              <div className="compliance-progress-panel">
                <div className="compliance-progress-header">
                  <strong>GPSR-dossier volledigheid</strong>
                  <span>{selectedStats?.progress ?? 0}%</span>
                </div>
                <div className="compliance-progress-track">
                  <div className="compliance-progress-fill" style={{ width: `${selectedStats?.progress ?? 0}%` }} />
                </div>
                {selectedStats?.missingItems.length ? (
                  <div className="compliance-progress-missing">
                    Ontbreekt: {selectedStats.missingItems.join(', ')}
                  </div>
                ) : null}
              </div>

              <div className="compliance-tabs">
                {detailTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={detailTab === tab.id ? 'active' : ''}
                    onClick={() => setDetailTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="compliance-detail-body">
                {detailTab === 'basic' && (
                  <div className="compliance-view-stack">
                    <section className="panel">
                      <div className="panel-title">Basisinformatie</div>
                      <div className="compliance-panel-body compliance-form-stack">
                        <div className="compliance-form-grid compliance-family-basic-grid">
                          <label>
                            <span>Code</span>
                            <input value={draftFamily.code || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, code: event.target.value } : current)} />
                          </label>
                          <label>
                            <span>Naam</span>
                            <input value={draftFamily.name || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, name: event.target.value } : current)} />
                          </label>
                          <label>
                            <span>Categorie</span>
                            <input value={draftFamily.category || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, category: event.target.value } : current)} />
                          </label>
                          <label>
                            <span>Risiconiveau</span>
                            <select value={draftFamily.riskLevel || 'medium'} onChange={(event) => setDraftFamily((current) => current ? { ...current, riskLevel: event.target.value as ComplianceProductFamily['riskLevel'] } : current)}>
                              <option value="low">Laag</option>
                              <option value="medium">Matig</option>
                              <option value="high">Hoog</option>
                              <option value="critical">Kritiek</option>
                            </select>
                          </label>
                          <label>
                            <span>Status</span>
                            <select value={draftFamily.status || 'concept'} onChange={(event) => setDraftFamily((current) => current ? { ...current, status: event.target.value as ComplianceProductFamily['status'] } : current)}>
                              <option value="concept">Concept</option>
                              <option value="in_review">In review</option>
                              <option value="not_applicable">Niet van toepassing</option>
                              <option value="archived">Archief</option>
                            </select>
                          </label>
                        </div>
                        <div className="compliance-family-settings-row">
                          <span className="compliance-family-settings-label">Dossierinstellingen</span>
                          <label className="checkbox-label">
                            <input type="checkbox" checked={draftFamily.gpsrRequired ?? true} onChange={(event) => setDraftFamily((current) => current ? { ...current, gpsrRequired: event.target.checked } : current)} />
                            <span>GPSR verplicht</span>
                          </label>
                          <label className="checkbox-label">
                            <input type="checkbox" checked={draftFamily.noWarningsNeeded ?? false} onChange={(event) => setDraftFamily((current) => current ? { ...current, noWarningsNeeded: event.target.checked } : current)} />
                            <span>Geen waarschuwingen nodig</span>
                          </label>
                        </div>
                        <div className="compliance-text-grid">
                          <label>
                            <span>Omschrijving</span>
                            <textarea value={draftFamily.description || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, description: event.target.value } : current)} rows={4} />
                          </label>
                          <label>
                            <span>Bedoeld gebruik</span>
                            <textarea value={draftFamily.intendedUse || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, intendedUse: event.target.value } : current)} rows={4} />
                          </label>
                          <label>
                            <span>Voorzienbaar verkeerd gebruik</span>
                            <textarea value={draftFamily.foreseeableMisuse || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, foreseeableMisuse: event.target.value } : current)} rows={4} />
                          </label>
                          <label>
                            <span>Notities</span>
                            <textarea value={draftFamily.notes || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, notes: event.target.value } : current)} rows={4} />
                          </label>
                          <label>
                            <span>Handleidingstekst</span>
                            <textarea value={draftFamily.manualText || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, manualText: event.target.value } : current)} rows={4} />
                          </label>
                        </div>
                        <section className="compliance-supplier-source-section">
                          <div className="compliance-supplier-source-heading">
                            <div>
                              <strong>Fabrikant, importeur en EU-verantwoordelijke</strong>
                              <span>Automatisch opgehaald uit de leveranciersgegevens van de gekoppelde producten.</span>
                            </div>
                            <span className="compliance-status-pill complete">Centrale bron</span>
                          </div>
                          {linkedSupplierDetails.length ? (
                            <div className="compliance-supplier-source-grid">
                              {linkedSupplierDetails.map(({ name, supplier, products: supplierProducts, importer, euResponsiblePerson }) => {
                                const exampleProduct = supplierProducts[0];
                                const manufacturerAddress = supplier
                                  ? [supplier.address, supplier.postalCode, supplier.city, supplier.country].filter(Boolean).join(', ')
                                  : [exampleProduct.manufacturerAddress, exampleProduct.manufacturerPostalCode, exampleProduct.manufacturerCity, exampleProduct.manufacturerCountry].filter(Boolean).join(', ');
                                const importerName = importer?.name || exampleProduct.importerName;
                                const euResponsibleName = euResponsiblePerson?.name || exampleProduct.euResponsiblePersonName;
                                return (
                                  <article className="compliance-supplier-source-card" key={name.toLocaleLowerCase('nl')}>
                                    <div className="compliance-supplier-source-card-title">
                                      <div><small>Leverancier / fabrikant</small><strong>{supplier?.name || exampleProduct.manufacturerName || name}</strong></div>
                                      <span>{supplierProducts.length} product{supplierProducts.length === 1 ? '' : 'en'}</span>
                                    </div>
                                    <dl>
                                      <dt>Contact</dt><dd>{supplier?.contactName || '-'}</dd>
                                      <dt>Adres</dt><dd>{manufacturerAddress || '-'}</dd>
                                      <dt>E-mail</dt><dd>{supplier?.email || exampleProduct.manufacturerEmail || '-'}</dd>
                                      <dt>Importeur</dt><dd>{importerName || 'Niet gekoppeld'}</dd>
                                      <dt>EU-verantwoordelijke</dt><dd>{euResponsibleName || 'Niet gekoppeld'}</dd>
                                    </dl>
                                  </article>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="empty">Koppel eerst producten aan deze familie; daarna verschijnen de leveranciersgegevens hier automatisch.</p>
                          )}
                        </section>
                      </div>
                    </section>
                  </div>
                )}

                {detailTab === 'risks' && (
                  <section className="panel">
                    <div className="panel-title">
                      <span>Risicoanalyse ({draftRisks.length})</span>
                      <button type="button" className="secondary-button" onClick={addRisk}><Plus size={14} /> Risico</button>
                    </div>
                    <div className="compliance-panel-body">
                      <div className="compliance-risk-help">
                        <span>Score = ernst x kans. Beide waarden lopen van 1 (laag) tot en met 5 (hoog).</span>
                        <span className="compliance-score-help">
                          <button type="button" aria-label="Uitleg scoreclassificatie"><CircleHelp size={17} /></button>
                          <span className="compliance-score-tooltip" role="tooltip">
                            <strong>Scoreclassificatie</strong>
                            <span><i className="low" /> 1-4: Laag</span>
                            <span><i className="medium" /> 5-8: Middel</span>
                            <span><i className="high" /> 9-15: Hoog</span>
                            <span><i className="critical" /> 16-25: Kritiek</span>
                            <small>Voorbeeld: ernst 5 x kans 2 = score 10, dus Hoog.</small>
                          </span>
                        </span>
                      </div>
                      <div className="compliance-risk-table-scroll">
                      <div className="compliance-grid-table compliance-risk-table">
                        <div className="compliance-card-row compliance-risk-table-header" aria-hidden="true">
                          <span>Gevaar</span>
                          <span>Risicobeschrijving</span>
                          <span>Beheersmaatregel</span>
                          <span>Ernst<br /><small>1-5</small></span>
                          <span>Kans<br /><small>1-5</small></span>
                          <span>Restrisico</span>
                          <span>Score</span>
                          <span>Actie</span>
                        </div>
                        {draftRisks.map((risk, index) => (
                          <div className="compliance-card-row" key={risk.id}>
                            <textarea rows={2} value={risk.hazard} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, hazard: event.target.value } : item))} placeholder="Omschrijf het gevaar" />
                            <textarea rows={2} value={risk.riskDescription || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, riskDescription: event.target.value } : item))} placeholder="Wat kan er gebeuren?" />
                            <textarea rows={2} value={risk.mitigation || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, mitigation: event.target.value } : item))} placeholder="Welke maatregel beperkt het risico?" />
                            <input type="number" min="1" max="5" value={risk.severity || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, severity: event.target.value } : item))} aria-label="Ernst, 1 tot 5" />
                            <input type="number" min="1" max="5" value={risk.probability || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, probability: event.target.value } : item))} aria-label="Kans, 1 tot 5" />
                            <input value={risk.residualRisk || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, residualRisk: event.target.value } : item))} placeholder="Rest" />
                            {(() => {
                              const score = asNumber(risk.severity) * asNumber(risk.probability);
                              const level = score >= 16 ? 'critical' : score >= 9 ? 'high' : score >= 5 ? 'medium' : score > 0 ? 'low' : 'none';
                              const label = level === 'critical' ? 'Kritiek' : level === 'high' ? 'Hoog' : level === 'medium' ? 'Middel' : level === 'low' ? 'Laag' : 'Niet berekend';
                              return <div className={`compliance-score-cell ${level}`} title={`Ernst ${risk.severity || '-'} x kans ${risk.probability || '-'} = ${score || 'niet berekend'}`}><strong>{score || '-'}</strong><span>{label}</span></div>;
                            })()}
                            <button type="button" className="icon-button danger" onClick={() => setDraftRisks((current) => current.filter((item) => item.id !== risk.id))}><Trash2 size={14} /></button>
                          </div>
                        ))}
                        {draftRisks.length === 0 ? <p className="empty">Nog geen risico's toegevoegd.</p> : null}
                      </div>
                      </div>
                    </div>
                  </section>
                )}

                {detailTab === 'warnings' && (
                  <section className="panel">
                    <div className="panel-title">
                      <span>Waarschuwingen ({draftWarnings.length})</span>
                      <button type="button" className="secondary-button" onClick={addWarning}><Plus size={14} /> Waarschuwing</button>
                    </div>
                    <div className="compliance-panel-body compliance-grid-table">
                      {draftWarnings.map((warning, index) => (
                        <div className="compliance-warning-row" key={warning.id}>
                          <input value={warning.warningType || ''} onChange={(event) => setDraftWarnings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, warningType: event.target.value } : item))} placeholder="Type" />
                          <input value={warning.warningTextNl} onChange={(event) => setDraftWarnings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, warningTextNl: event.target.value } : item))} placeholder="Nederlandse waarschuwing" />
                          <label className="checkbox-label small"><input type="checkbox" checked={warning.requiredOnLabel ?? false} onChange={(event) => setDraftWarnings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, requiredOnLabel: event.target.checked } : item))} /><span>Op label</span></label>
                          <label className="checkbox-label small"><input type="checkbox" checked={warning.requiredInManual ?? true} onChange={(event) => setDraftWarnings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, requiredInManual: event.target.checked } : item))} /><span>In handleiding</span></label>
                          <button type="button" className="icon-button danger" onClick={() => setDraftWarnings((current) => current.filter((item) => item.id !== warning.id))}><Trash2 size={14} /></button>
                        </div>
                      ))}
                      {draftWarnings.length === 0 ? <p className="empty">Nog geen waarschuwingen toegevoegd.</p> : null}
                    </div>
                  </section>
                )}

                {detailTab === 'requirements' && (
                  <section className="panel">
                    <div className="panel-title">
                      <span>Keuringseisen ({draftRequirements.length})</span>
                      <button type="button" className="secondary-button" onClick={addRequirement}><Plus size={14} /> Eis</button>
                    </div>
                    <div className="compliance-panel-body compliance-grid-table">
                      {draftRequirements.map((requirement, index) => {
                        const fulfilled = requirementFulfilled(requirement, draftDocuments);
                        return (
                          <div className="compliance-warning-row" key={requirement.id}>
                            <input value={requirement.name} onChange={(event) => setDraftRequirements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Naam eis" />
                            <input value={requirement.regulation || ''} onChange={(event) => setDraftRequirements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, regulation: event.target.value } : item))} placeholder="Regeling / norm" />
                            <label className="checkbox-label small"><input type="checkbox" checked={requirement.mandatory ?? true} onChange={(event) => setDraftRequirements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, mandatory: event.target.checked } : item))} /><span>Verplicht</span></label>
                            <span className={`compliance-inline-status ${fulfilled ? 'success' : 'warning'}`}>{fulfilled ? 'Document aanwezig' : 'Open'}</span>
                            <button type="button" className="icon-button danger" onClick={() => setDraftRequirements((current) => current.filter((item) => item.id !== requirement.id))}><Trash2 size={14} /></button>
                            <textarea value={requirement.notes || ''} onChange={(event) => setDraftRequirements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))} placeholder="Notities / toelichting" rows={2} />
                          </div>
                        );
                      })}
                      {draftRequirements.length === 0 ? <p className="empty">Nog geen keuringseisen toegevoegd.</p> : null}
                    </div>
                  </section>
                )}

                {detailTab === 'tests' && (
                  <section className="panel">
                    <div className="panel-title">
                      <span>Testplannen en testlogboek</span>
                      <div className="page-title-actions">
                        <button type="button" className="secondary-button" onClick={addTestPlan}><Plus size={14} /> Testplan</button>
                        <button type="button" className="secondary-button" onClick={() => addTest()}><Plus size={14} /> Test</button>
                      </div>
                    </div>
                    <div className="compliance-panel-body compliance-view-stack">
                      <div className="compliance-test-section">
                        <div className="compliance-test-section-heading">
                          <div><strong>Testplannen</strong><span>Leg vast wat, hoe vaak en volgens welke methode getest moet worden.</span></div>
                          <span className="compliance-count-badge">{draftTestPlans.length}</span>
                        </div>
                        {draftTestPlans.map((plan, index) => {
                          const fulfilled = testPlanFulfilled(plan, draftTests);
                          return (
                            <div className="compliance-test-plan-card" key={plan.id}>
                              <div className="compliance-test-plan-grid">
                                <label className="compliance-labeled-field"><span>Naam testplan</span><input value={plan.name} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Naam testplan" /></label>
                                <label className="compliance-labeled-field"><span>Frequentie</span><input value={plan.frequency || ''} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, frequency: event.target.value } : item))} placeholder="Bijv. per batch of jaarlijks" /></label>
                                <label className="checkbox-label small compliance-test-required"><input type="checkbox" checked={plan.mandatory ?? true} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, mandatory: event.target.checked } : item))} /><span>Verplicht</span></label>
                                <span className={`compliance-inline-status ${fulfilled ? 'success' : 'warning'}`}>{fulfilled ? 'Geslaagd' : 'Open'}</span>
                                <button type="button" className="icon-button danger" title="Testplan verwijderen" onClick={() => setDraftTestPlans((current) => current.filter((item) => item.id !== plan.id))}><Trash2 size={14} /></button>
                              </div>
                              <label className="compliance-labeled-field"><span>Methode en acceptatiecriteria</span><textarea value={plan.method || ''} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method: event.target.value } : item))} placeholder="Beschrijf de testmethode en wanneer de test geslaagd is" rows={3} /></label>
                              <div className="compliance-test-plan-footer"><button type="button" className="secondary-button" onClick={() => addTest(plan.id)}><Plus size={14} /> Testresultaat toevoegen</button></div>
                            </div>
                          );
                        })}
                        {draftTestPlans.length === 0 ? <p className="empty">Nog geen testplannen toegevoegd.</p> : null}
                      </div>

                      <div className="compliance-test-section">
                        <div className="compliance-test-section-heading">
                          <div><strong>Testlogboek</strong><span>Registreer uitgevoerde tests en eventuele corrigerende acties.</span></div>
                          <span className="compliance-count-badge">{draftTests.length}</span>
                        </div>
                        <datalist id={`family-batches-${draftFamily.id}`}>
                          {familyBatchOptions.map((batch) => <option key={batch.value} value={batch.value}>{batch.label}</option>)}
                        </datalist>
                        {draftTests.map((test, index) => (
                          <div className="compliance-test-result-card" key={test.id}>
                            <div className="compliance-test-result-grid">
                            <label className="compliance-labeled-field"><span>Testdatum</span><input type="date" value={test.testDate} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, testDate: event.target.value } : item))} /></label>
                            <label className="compliance-labeled-field"><span>Testplan</span><select value={test.planId || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, planId: event.target.value || undefined } : item))}>
                              <option value="">Losse test</option>
                              {draftTestPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name || 'Onbenoemd plan'}</option>)}
                            </select></label>
                            <label className="compliance-labeled-field"><span>Resultaat</span><select value={test.result || 'pass'} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, result: event.target.value as ComplianceProductTest['result'] } : item))}>
                              <option value="pass">Geslaagd</option><option value="fail">Afgekeurd</option><option value="conditional">Voorwaardelijk</option>
                            </select></label>
                            <label className="compliance-labeled-field"><span>Getest door</span><input value={test.testedBy || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, testedBy: event.target.value } : item))} placeholder="Naam of organisatie" /></label>
                            <label className="compliance-labeled-field"><span>Batch / referentie</span><input list={`family-batches-${draftFamily.id}`} value={test.batchRef || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, batchRef: event.target.value } : item))} placeholder={familyBatchOptions.length ? 'Kies batch van gekoppeld product' : 'Geen batch gevonden - handmatig invullen'} /></label>
                            <button type="button" className="icon-button danger" title="Testresultaat verwijderen" onClick={() => setDraftTests((current) => current.filter((item) => item.id !== test.id))}><Trash2 size={14} /></button>
                            </div>
                            <div className="compliance-test-result-notes">
                              <label className="compliance-labeled-field"><span>Bevindingen</span><textarea value={test.findings || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, findings: event.target.value } : item))} placeholder="Bevindingen" rows={3} /></label>
                              <label className="compliance-labeled-field"><span>Corrigerende actie</span><textarea value={test.correctiveAction || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, correctiveAction: event.target.value } : item))} placeholder="Corrigerende actie" rows={3} /></label>
                            </div>
                          </div>
                        ))}
                        {draftTests.length === 0 ? <p className="empty">Nog geen testen geregistreerd.</p> : null}
                      </div>
                    </div>
                  </section>
                )}

                {detailTab === 'documents' && (
                  <section className="panel">
                    <div className="panel-title">
                      <span>Documenten ({draftDocuments.length})</span>
                      <button type="button" className="secondary-button" onClick={addDocument}><Plus size={14} /> Document</button>
                    </div>
                    <div className="compliance-panel-body compliance-grid-table">
                      {draftDocuments.map((document, index) => (
                        <div className="compliance-document-row" key={document.id}>
                          <select value={document.requirementId || ''} onChange={(event) => setDraftDocuments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, requirementId: event.target.value || undefined } : item))}>
                            <option value="">Geen keuringseis gekoppeld</option>
                            {draftRequirements.map((requirement) => <option key={requirement.id} value={requirement.id}>{requirement.name || requirement.regulation || 'Nieuwe eis'}</option>)}
                          </select>
                          <input value={document.documentType || ''} onChange={(event) => setDraftDocuments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, documentType: event.target.value } : item))} placeholder="Type document" />
                          <input value={document.documentName} onChange={(event) => setDraftDocuments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, documentName: event.target.value } : item))} placeholder="Bestandsnaam" />
                          <input value={document.fileUrl || ''} onChange={(event) => setDraftDocuments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fileUrl: event.target.value } : item))} placeholder="URL of pad" />
                          <input type="date" value={document.validUntil || ''} onChange={(event) => setDraftDocuments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, validUntil: event.target.value } : item))} />
                          <button type="button" className="icon-button danger" onClick={() => setDraftDocuments((current) => current.filter((item) => item.id !== document.id))}><Trash2 size={14} /></button>
                        </div>
                      ))}
                      {draftDocuments.length === 0 ? <p className="empty">Nog geen documenten gekoppeld.</p> : null}
                    </div>
                  </section>
                )}

                {detailTab === 'links' && (
                  <section className="panel">
                    <div className="panel-title">Gekoppelde producten ({filteredFamilyProducts.length})</div>
                    <div className="compliance-panel-body compliance-view-stack">
                      <div className="compliance-link-toolbar">
                        <div className="search-field">
                          <Search size={16} />
                          <input value={linkSearch} onChange={(event) => { setLinkSearch(event.target.value); setLinkPage(1); }} placeholder="Zoek in gekoppelde producten" />
                        </div>
                        <label className="search-field compliance-link-add-field">
                          <Plus size={16} />
                          <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Zoek product om te koppelen" />
                        </label>
                      </div>

                      {productSearch.trim() ? (
                        <div className="compliance-product-search-results">
                          {searchableUnlinkedProducts.map((product) => (
                            <button type="button" key={product.id} onClick={() => addProductLink(product)}>
                              <strong>{product.code}</strong>
                              <span>{product.description}</span>
                            </button>
                          ))}
                          {searchableUnlinkedProducts.length === 0 ? <p className="empty">Geen niet-gekoppelde producten gevonden.</p> : null}
                        </div>
                      ) : null}

                      <div className="compliance-linked-products-table">
                        <div className="compliance-linked-products-header">
                          <span>Artikelnummer</span>
                          <span>Omschrijving</span>
                          <span>Categorie</span>
                          <span className="compliance-linked-products-actions-heading">Acties</span>
                        </div>
                        {pagedLinkedProducts.map(({ link, product }) => (
                          <div className="compliance-linked-products-row" key={link.id}>
                            <strong>{product?.code || '-'}</strong>
                            <span>{product?.description || link.variantDescription || '-'}</span>
                            <span>{product?.articleGroup || link.variantDescription || '-'}</span>
                            <div className="compliance-linked-product-actions">
                              {product ? (
                                <button
                                  type="button"
                                  className="secondary-button compliance-row-action-button"
                                  onClick={() => {
                                    setFamilyDialogOpen(false);
                                    onSelectProduct(product, 'gpsr');
                                  }}
                                >
                                  Open product
                                </button>
                              ) : null}
                              <button type="button" className="danger-button compliance-row-action-button" onClick={() => void deactivateLink(link.id)} disabled={saving || Boolean(unlinkingLinkId)}>
                                {unlinkingLinkId === link.id ? 'Ontkoppelen…' : 'Ontkoppel'}
                              </button>
                            </div>
                          </div>
                        ))}
                        {pagedLinkedProducts.length === 0 ? <p className="empty">Geen gekoppelde producten gevonden.</p> : null}
                      </div>

                      {filteredFamilyProducts.length > linkedProductsPageSize ? (
                        <div className="compliance-pagination">
                          <button type="button" className="secondary-button" disabled={linkPage === 1} onClick={() => setLinkPage((current) => Math.max(1, current - 1))}>Vorige</button>
                          <span>Pagina {linkPage} van {linkedProductsPageCount}</span>
                          <button type="button" className="secondary-button" disabled={linkPage === linkedProductsPageCount} onClick={() => setLinkPage((current) => Math.min(linkedProductsPageCount, current + 1))}>Volgende</button>
                        </div>
                      ) : null}
                      {linkActionMessage ? <p className="drawer-note">{linkActionMessage}</p> : null}
                    </div>
                  </section>
                )}

                {detailTab === 'dossier' && (
                  <section className="panel">
                    <div className="panel-title">Dossier genereren</div>
                    <div className="compliance-panel-body compliance-dossier-panel">
                      <div className="compliance-dossier-summary">
                        <div><span>Productfamilie</span><strong>{draftFamily.name || '-'}</strong></div>
                        <div><span>Code</span><strong>{draftFamily.code || '-'}</strong></div>
                        <div><span>Risicoanalyse</span><strong>{draftRisks.length} regels</strong></div>
                        <div><span>Waarschuwingen</span><strong>{draftWarnings.length} regels</strong></div>
                        <div><span>Documenten</span><strong>{draftDocuments.length} gekoppeld</strong></div>
                        <div><span>Producten</span><strong>{selectedFamilyProducts.length} gekoppeld</strong></div>
                      </div>
                      <p>Open een nette print-/PDF-preview van het GPSR technisch dossier met dezelfde data uit deze app.</p>
                      <div>
                        <button type="button" className="primary-button" onClick={requestDossierPreview}>Afdrukken / PDF</button>
                      </div>
                    </div>
                  </section>
                )}

                {detailTab === 'revisions' && (
                  <section className="panel">
                    <div className="panel-title">
                      <span>Revisiegeschiedenis ({draftRevisions.length})</span>
                      <button type="button" className="secondary-button" onClick={() => addRevision()}><Plus size={14} /> Revisie</button>
                    </div>
                    <div className="compliance-panel-body compliance-grid-table">
                      {draftRevisions.map((revision, index) => (
                        <div className="compliance-document-row" key={revision.id}>
                          <input type="datetime-local" value={(revision.createdAt || '').slice(0, 16)} onChange={(event) => setDraftRevisions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, createdAt: event.target.value } : item))} />
                          <input value={revision.changedBy || ''} onChange={(event) => setDraftRevisions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, changedBy: event.target.value } : item))} placeholder="Gewijzigd door" />
                          <button type="button" className="icon-button danger" onClick={() => setDraftRevisions((current) => current.filter((item) => item.id !== revision.id))}><Trash2 size={14} /></button>
                          <textarea value={revision.changeNote} onChange={(event) => setDraftRevisions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, changeNote: event.target.value } : item))} placeholder="Wijzigingsnotitie" rows={2} />
                        </div>
                      ))}
                      {draftRevisions.length === 0 ? <p className="empty">Nog geen revisies vastgelegd.</p> : null}
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </section>
        </div>
        ) : null}
        {dossierPickerOpen ? (
          <div className="modal-backdrop compliance-dossier-picker-backdrop" onMouseDown={() => setDossierPickerOpen(false)}>
            <section className="panel compliance-dossier-picker" onMouseDown={(event) => event.stopPropagation()}>
              <div className="panel-title">
                <div className="compliance-dossier-picker-title"><strong>Kies één product voor het GPSR-dossier</strong><small>Het dossier wordt productgericht gegenereerd; de familiegegevens worden als gedeelde basis gebruikt.</small></div>
                <button type="button" className="secondary-button" onClick={() => setDossierPickerOpen(false)}>Sluiten</button>
              </div>
              <div className="compliance-dossier-picker-body">
                <div className="search-field">
                  <Search size={16} />
                  <input value={dossierProductQuery} onChange={(event) => setDossierProductQuery(event.target.value)} placeholder="Zoek op artikelnummer, omschrijving of categorie" autoFocus />
                </div>
                <div className="compliance-dossier-product-list">
                  {selectedFamilyProducts
                    .filter(({ product, link }) => `${product?.code || ''} ${product?.description || ''} ${product?.articleGroup || ''} ${link.variantDescription || ''}`.toLocaleLowerCase('nl').includes(dossierProductQuery.trim().toLocaleLowerCase('nl')))
                    .map(({ product, link }) => {
                      const productId = product?.id || link.productId;
                      return (
                        <label className={`compliance-dossier-product-row ${dossierProductId === productId ? 'selected' : ''}`} key={link.id}>
                          <input type="radio" name="dossierProduct" checked={dossierProductId === productId} onChange={() => setDossierProductId(productId)} />
                          <strong>{product?.code || link.productId}</strong>
                          <span>{product?.description || link.variantDescription || '-'}</span>
                          <small>{product?.articleGroup || link.variantDescription || '-'}</small>
                        </label>
                      );
                    })}
                </div>
              </div>
              <div className="compliance-dossier-picker-actions">
                <span>{dossierProductId ? '1 product geselecteerd' : 'Selecteer verplicht één product'}</span>
                <button type="button" className="primary-button" disabled={!dossierProductId} onClick={() => openDossierPreview(dossierProductId)}>Dossier genereren</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  function renderUnlinkedProductsView() {
    const suggestionLabel = (product: Product) => {
      const suggestion = unlinkedSuggestions.find((item) => item.productId === product.id);
      const family = suggestion ? families.find((item) => item.id === suggestion.familyId) : null;
      return family ? `${family.code} - ${family.name}` : 'Geen suggestie';
    };
    const sortedUnlinkedProducts = [...productsWithoutFamily].sort((left, right) => {
      const values = {
        code: [left.code || '', right.code || ''],
        name: [left.description || '', right.description || ''],
        category: [left.articleGroup || '', right.articleGroup || ''],
        suggestion: [suggestionLabel(left), suggestionLabel(right)],
      };
      const [leftValue, rightValue] = values[unlinkedSort.field];
      const result = leftValue.localeCompare(rightValue, 'nl', { numeric: true, sensitivity: 'base' });
      return unlinkedSort.direction === 'asc' ? result : -result;
    });
    const sortHeader = (field: typeof unlinkedSort.field, label: string) => (
      <button
        type="button"
        className={`column-sort-button${unlinkedSort.field === field ? ' active' : ''}`}
        onClick={() => setUnlinkedSort((current) => ({
          field,
          direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
        }))}
        title={`Sorteren op ${label.toLowerCase()}`}
      >
        <span>{label}</span>
        {unlinkedSort.field !== field ? <ArrowUpDown size={13} /> : unlinkedSort.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      </button>
    );

    return (
      <div className="compliance-view-stack">
        <section className="panel">
          <div className="panel-title">
            <span>Producten zonder familie ({productsWithoutFamily.length})</span>
            <button type="button" className="secondary-button" disabled={unlinkedSuggestions.length === 0 || saving} onClick={() => void handleAutoLink()}>
              <Link2 size={14} /> Automatisch koppelen
            </button>
          </div>
          <div className="compliance-panel-body compliance-view-stack">
            {unlinkedActionMessage ? <div className={`inline-notice ${unlinkedActionMessage.startsWith('Koppelen mislukt') ? 'warning-notice' : 'success-notice'}`}>{unlinkedActionMessage}</div> : null}
            <div className="search-field">
              <Search size={16} />
              <input value={unlinkedQuery} onChange={(event) => setUnlinkedQuery(event.target.value)} placeholder="Zoeken op artikelnummer, omschrijving of categorie" />
            </div>
            <div className="compliance-linked-products-table">
              <div className="compliance-linked-products-header compliance-unlinked-products-header">
                {sortHeader('code', 'Artikelnummer')}
                {sortHeader('name', 'Naam')}
                {sortHeader('category', 'Categorie')}
                {sortHeader('suggestion', 'Suggestie')}
                <span>Handmatig koppelen</span>
              </div>
              {sortedUnlinkedProducts.map((product) => {
                const suggestion = unlinkedSuggestions.find((item) => item.productId === product.id);
                const family = suggestion ? families.find((item) => item.id === suggestion.familyId) : null;
                return (
                  <div className="compliance-linked-products-row compliance-unlinked-products-row" key={product.id}>
                    <strong>{product.code || '-'}</strong>
                    <span>{product.description || '-'}</span>
                    <span>{product.articleGroup || '-'}</span>
                    <span>{family ? `${family.code} - ${family.name}` : 'Geen suggestie'}</span>
                    <div className="compliance-unlinked-link-action">
                      <select
                        aria-label={`Productfamilie voor ${product.code}`}
                        value={manualFamilyByProduct[product.id] || ''}
                        onChange={(event) => setManualFamilyByProduct((current) => ({ ...current, [product.id]: event.target.value }))}
                      >
                        <option value="">Kies productfamilie...</option>
                        {[...families]
                          .sort((left, right) => left.name.localeCompare(right.name, 'nl', { sensitivity: 'base' }))
                          .map((option) => <option key={option.id} value={option.id}>{option.code} - {option.name}</option>)}
                      </select>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!manualFamilyByProduct[product.id] || Boolean(manualLinkingProductId)}
                        onClick={() => void handleManualProductLink(product)}
                      >
                        <Link2 size={14} /> {manualLinkingProductId === product.id ? 'Koppelen...' : 'Koppelen'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {productsWithoutFamily.length === 0 ? <p className="empty">Alle producten zijn gekoppeld aan een familie.</p> : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderDocumentsView() {
    return (
      <div className="compliance-view-stack">
        <section className="panel">
          <div className="panel-title">Documenten</div>
          <div className="compliance-panel-body compliance-view-stack">
            <div className="search-field">
              <Search size={16} />
              <input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Zoeken op document of productfamilie" />
            </div>
            <div className="compliance-linked-products-table">
              <div className="compliance-linked-products-header">
                <span>Familie</span>
                <span>Document</span>
                <span>Type</span>
                <span>Geldig t/m</span>
              </div>
              {documentsWithFamily.map(({ document, family }) => (
                <div className="compliance-linked-products-row" key={document.id}>
                  <strong>{family?.name || '-'}</strong>
                  <span>{document.documentName}</span>
                  <span>{document.documentType || '-'}</span>
                  <span className={`compliance-inline-status ${expiryState(document.validUntil) === 'expired' ? 'danger' : expiryState(document.validUntil) === 'soon' ? 'warning' : 'neutral'}`}>{formatDate(document.validUntil)}</span>
                </div>
              ))}
              {documentsWithFamily.length === 0 ? <p className="empty">Geen documenten gevonden.</p> : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderTemplatesView() {
    const sortedTemplateFamilies = [...templateSummary.families]
      .sort((left, right) => left.name.localeCompare(right.name, 'nl', { sensitivity: 'base' }));
    const filteredTemplateFamilies = sortedTemplateFamilies.filter((family) => {
      const query = templateQuery.trim().toLocaleLowerCase('nl');
      const matchesQuery = !query || `${family.name} ${family.code} ${family.category || ''} ${family.description || ''}`.toLocaleLowerCase('nl').includes(query);
      const matchesRisk = templateRiskFilter === 'all' || family.riskLevel === templateRiskFilter;
      return matchesQuery && matchesRisk;
    });
    return (
      <div className="compliance-view-stack">
        <section className="panel compliance-templates-panel">
          <div className="panel-title">
            <div className="compliance-template-title-copy"><span>GPSR-templates</span><small>Alfabetisch gesorteerd op naam</small></div>
            <button type="button" className="primary-button" onClick={() => void handleSeedTemplates()} disabled={saving}>
              <DatabaseZap size={14} /> Templates laden
            </button>
          </div>
          <div className="compliance-panel-body">
            <div className="compliance-template-toolbar">
              <div className="search-field">
                <Search size={16} />
                <input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder="Zoek op naam, code, categorie of omschrijving" />
              </div>
              <select value={templateRiskFilter || 'all'} onChange={(event) => setTemplateRiskFilter(event.target.value as typeof templateRiskFilter)}>
                <option value="all">Alle risiconiveaus</option>
                <option value="low">Laag</option>
                <option value="medium">Matig</option>
                <option value="high">Hoog</option>
                <option value="critical">Kritiek</option>
              </select>
              <span className="compliance-template-result-count"><strong>{filteredTemplateFamilies.length}</strong> van {sortedTemplateFamilies.length}</span>
            </div>
            <div className="compliance-template-grid">
              {filteredTemplateFamilies.map((family) => {
                const templateRiskCount = templateSummary.risks.filter((item) => item.familyId === family.id).length;
                const templateWarningCount = templateSummary.warnings.filter((item) => item.familyId === family.id).length;
                return (
                  <article key={family.id} className="compliance-template-card">
                    <div className="compliance-template-card-header">
                      <span className="compliance-template-code">{family.code}</span>
                      <span className={`compliance-badge ${family.riskLevel === 'high' || family.riskLevel === 'critical' ? 'danger' : family.riskLevel === 'medium' ? 'warning' : 'success'}`}>{riskLabel(family.riskLevel)}</span>
                    </div>
                    <h3>{family.name}</h3>
                    <span className="compliance-template-category">{family.category || 'Geen categorie'}</span>
                    <p>{family.description || 'Geen omschrijving'}</p>
                    <div className="compliance-template-stats">
                      <span>{templateRiskCount} risico's</span>
                      <span>{templateWarningCount} waarschuwingen</span>
                    </div>
                  </article>
                );
              })}
            </div>
            {filteredTemplateFamilies.length === 0 ? <div className="empty-state inline"><Search size={22} /><strong>Geen templates gevonden</strong><span>Pas de zoekterm of het risicofilter aan.</span></div> : null}
          </div>
        </section>
      </div>
    );
  }

  function createPackagingSupplierDraft() {
    const supplier: Supplier = {
      id: createComplianceEntityId('packaging-supplier'),
      name: '',
      isPackagingSupplier: true,
      active: true,
      supplierSchemaVersion: 2,
      herkomst: 'niet_eu',
      ppwrSupplierRole: 'productleverancier_niet_eu',
      packagingProfile: [],
    };
    setDraftPackagingSupplier(supplier);
    setSelectedPackagingSupplierKey(`draft-${supplier.id}`);
    setPackagingDetailTab('basic');
    setPackagingDialogOpen(true);
  }

  async function savePackagingSupplier() {
    if (!draftPackagingSupplier) return;
    setSaving(true);
    try {
      const migrated = migrateSupplierPpwr(draftPackagingSupplier);
      await onSavePackagingSupplier({
        ...migrated,
        name: draftPackagingSupplier.name.trim(),
        contactName: draftPackagingSupplier.contactName?.trim() || undefined,
        email: draftPackagingSupplier.email?.trim() || undefined,
        phone: draftPackagingSupplier.phone?.trim() || undefined,
        mobile: draftPackagingSupplier.mobile?.trim() || undefined,
        website: draftPackagingSupplier.website?.trim() || undefined,
        address: draftPackagingSupplier.address?.trim() || undefined,
        postalCode: draftPackagingSupplier.postalCode?.trim() || undefined,
        city: draftPackagingSupplier.city?.trim() || undefined,
        country: draftPackagingSupplier.country?.trim() || undefined,
        supplierSchemaVersion: 2,
        herkomst: roleHerkomst(migrated.ppwrSupplierRole),
        ppwrResponsibility: undefined,
        ppwrContractStatus: undefined,
        ppwrDeclarationStatus: undefined,
        ppwrEprNumber: undefined,
        ppwrLastDeclarationAt: undefined,
        ppwrNotes: draftPackagingSupplier.ppwrNotes?.trim() || undefined,
        notes: draftPackagingSupplier.notes?.trim() || undefined,
        isPackagingSupplier: draftPackagingSupplier.isPackagingSupplier !== false,
        active: draftPackagingSupplier.active !== false,
      });
      setSelectedPackagingSupplierKey(draftPackagingSupplier.id);
    } finally {
      setSaving(false);
    }
  }

  function updatePurchasedPackagingItem(itemId: string, updates: Partial<NonNullable<Supplier['packagingItems']>[number]>) {
    setDraftPackagingSupplier((current) => current ? {
      ...current,
      packagingItems: (current.packagingItems ?? []).map((item) => item.id === itemId ? { ...item, ...updates } : item),
    } : current);
  }

  function addCrazyLabelsFormats() {
    setDraftPackagingSupplier((current) => {
      if (!current) return current;
      const existingItems = current.packagingItems ?? [];
      const formats = [
        { artikelCode: 'DYMO-89X36', omschrijving: 'Productetiket DYMO 89 × 36 mm', afmetingen: '89 × 36 mm' },
        { artikelCode: 'ZEBRA-80X42', omschrijving: 'Productetiket ZEBRA 80 × 42 mm', afmetingen: '80 × 42 mm' },
        { artikelCode: 'ZEBRA-80X36', omschrijving: 'Productetiket ZEBRA 80 × 36 mm', afmetingen: '80 × 36 mm' },
      ];
      const existingCodes = new Set(existingItems.map((item) => item.artikelCode.trim().toLowerCase()));
      const additions = formats
        .filter((format) => !existingCodes.has(format.artikelCode.toLowerCase()))
        .map((format, index) => ({
          ...createPurchasedPackagingItem(),
          id: `verpakking-label-${Date.now()}-${index + 1}`,
          categorie: 'productetiket' as const,
          ...format,
        }));
      return { ...current, packagingItems: [...existingItems, ...additions] };
    });
  }

  function toggleSupplierDocumentPackagingItem(documentId: string, itemId: string, linked: boolean) {
    setDraftPackagingSupplier((current) => current ? {
      ...current,
      ppwrDocuments: (current.ppwrDocuments ?? []).map((document) => {
        if (document.id !== documentId) return document;
        const linkedItemIds = new Set(document.packagingItemIds ?? []);
        if (linked) linkedItemIds.add(itemId);
        else linkedItemIds.delete(itemId);
        return { ...document, packagingItemIds: Array.from(linkedItemIds) };
      }),
    } : current);
  }

  async function addSupplierDocument(file: File) {
    if (!draftPackagingSupplier) return;
    setSupplierDocumentMessage('Document uploaden...');
    try {
      const storagePath = await onUploadSupplierDocument(file, draftPackagingSupplier.id);
      const document = {
        id: createComplianceEntityId('supplier-document'),
        fileName: file.name,
        storagePath,
        uploadedAt: new Date().toISOString(),
      };
      setDraftPackagingSupplier((current) => current ? { ...current, ppwrDocuments: [...(current.ppwrDocuments ?? []), document] } : current);
      setSupplierDocumentMessage(`${file.name} toegevoegd. Klik op Opslaan om de koppeling te bewaren.`);
    } catch (error) {
      setSupplierDocumentMessage(error instanceof Error ? error.message : 'Document uploaden mislukt.');
    }
  }

  function renderPackagingSuppliersView() {
    const selectedUsage = allPackagingSupplierRows.find((row) => row.key === selectedPackagingSupplierKey)?.usage;
    const profileLayers = draftPackagingSupplier?.packagingProfile ?? [];
    const profileBases = new Set(profileLayers.map((layer) => layer.gewichtBasis));
    const profileBasisLabel = profileBases.size > 1 ? 'gemengd' : profileLayers[0]?.gewichtBasis === 'per_doos' ? 'doos' : 'stuk';
    const linkedProductWeights = (selectedUsage?.products ?? []).map((product) => Number(product.packagingWeightTotalGrams || product.packagingWeightPrimaryGrams || 0));
    const linkedProductWeightTotal = linkedProductWeights.reduce((total, weight) => total + (Number.isFinite(weight) ? weight : 0), 0);
    const ppwrMissingItems: string[] = [];
    if (draftPackagingSupplier) {
      if (!draftPackagingSupplier.ppwrSupplierRole) ppwrMissingItems.push('PPWR-rol');
      if (draftPackagingSupplier.isPackagingSupplier === false) ppwrMissingItems.push('actieve verpakkingsleverancier');
      if (draftPackagingSupplier.herkomst === 'eu') {
        if (draftPackagingSupplier.docStatus?.status !== 'ontvangen') ppwrMissingItems.push('ontvangen conformiteitsverklaring');
        if (!draftPackagingSupplier.docStatus?.bestandsnaam?.trim()) ppwrMissingItems.push('documentreferentie');
      } else {
        if (profileLayers.length === 0) ppwrMissingItems.push('minimaal één profiellaag');
        if (profileLayers.some((layer) => !layer.materiaalcode.trim() || layer.gewichtGram <= 0)) ppwrMissingItems.push('materiaalcode of gewicht per laag');
        if (profileLayers.length > 0 && !profileLayers.some((layer) => layer.bron !== 'schatting')) ppwrMissingItems.push('geverifieerde databron');
      }
    }
    const ppwrTotalChecks = draftPackagingSupplier?.herkomst === 'eu' ? 4 : 5;
    const ppwrProgress = draftPackagingSupplier ? Math.max(0, Math.round(((ppwrTotalChecks - ppwrMissingItems.length) / ppwrTotalChecks) * 100)) : 0;

    return (
      <div className="compliance-view-stack">
        <section className="panel compliance-family-table-panel">
          <div className="panel-title">
            <span className="panel-title-label">PPWR leveranciers</span>
            <button type="button" className="primary-button" onClick={createPackagingSupplierDraft}>
              <Plus size={14} /> Nieuwe kaart
            </button>
          </div>
          <div className="compliance-panel-body compliance-view-stack">
            <section className="stat-grid packaging-supplier-stat-grid">
              <button type="button" className={`stat-card packaging-filter-card ${supplierStatusFilter === 'all' ? 'active' : ''}`} onClick={() => setSupplierStatusFilter('all')}><ShieldCheck size={18} /><div><span>Kaarten</span><strong>{packagingSupplierTotals.total}</strong></div></button>
              <button type="button" className={`stat-card packaging-filter-card success ${supplierStatusFilter === 'complete' ? 'active' : ''}`} onClick={() => setSupplierStatusFilter('complete')}><CheckCircle2 size={18} /><div><span>PPWR gereed</span><strong>{packagingSupplierTotals.ready}</strong></div></button>
              <button type="button" className={`stat-card packaging-filter-card danger ${supplierStatusFilter === 'blocked' ? 'active' : ''}`} onClick={() => setSupplierStatusFilter('blocked')}><AlertTriangle size={18} /><div><span>Geblokkeerd</span><strong>{packagingSupplierTotals.blocked}</strong></div></button>
            </section>
            <button type="button" className={`packaging-attention-filter ${supplierStatusFilter === 'attention' ? 'active' : ''}`} onClick={() => setSupplierStatusFilter(supplierStatusFilter === 'attention' ? 'all' : 'attention')}>Toon alleen status Aanvullen</button>
            <div className="search-field">
              <Search size={16} />
              <input value={supplierQuery} onChange={(event) => setSupplierQuery(event.target.value)} placeholder="Zoeken op leverancier of materiaal..." />
            </div>
            <div className="compliance-family-table-scroll">
              <table className="compliance-family-table">
                <thead><tr><th>Naam</th><th>Status</th><th>Profiellagen</th><th>Productlagen</th><th>Acties</th></tr></thead>
                <tbody>
                  {packagingSupplierRows.map((row) => (
                    <tr key={row.key} className={selectedPackagingSupplierKey === row.key ? 'active' : ''}>
                      <td><button type="button" className="compliance-family-link-button" onClick={() => { setSelectedPackagingSupplierKey(row.key); setPackagingDetailTab('basic'); setPackagingDialogOpen(true); }}>{row.supplier?.name || row.usage?.name || 'Naam ontbreekt'}</button></td>
                      <td><span className={`compliance-status-pill ${ppwrSupplierStatus(row.supplier) === 'compleet' ? 'complete' : ppwrSupplierStatus(row.supplier) === 'geblokkeerd' ? 'danger' : row.supplier ? 'partial' : 'concept'}`}>{row.supplier ? supplierStatusLabel(row.supplier) : 'Nog aanmaken'}</span></td>
                      <td>{row.supplier?.packagingProfile?.length ?? 0}</td>
                      <td title="Afgeleid uit gekoppelde producten">{row.usage?.layers ?? 0}</td>
                      <td><button type="button" className="secondary-button" onClick={() => { setSelectedPackagingSupplierKey(row.key); setPackagingDetailTab('basic'); setPackagingDialogOpen(true); }}>Detail / bewerken</button></td>
                    </tr>
                  ))}
                  {packagingSupplierRows.length === 0 ? <tr><td colSpan={5}><p className="empty">Geen leveranciers gevonden voor deze filters.</p></td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {packagingDialogOpen && draftPackagingSupplier ? (
        <div className="modal-backdrop compliance-detail-dialog-backdrop" onMouseDown={() => setPackagingDialogOpen(false)}>
        <section className="panel compliance-family-detail compliance-detail-dialog packaging-supplier-dialog" ref={packagingDetailRef} onMouseDown={(event) => event.stopPropagation()}>
          {!draftPackagingSupplier ? (
            <p className="empty compliance-empty">Kies links een verpakkingsleverancier of maak een nieuwe kaart aan.</p>
          ) : (
            <>
              <div className="panel-title compliance-family-detail-header">
                <div>
                  <span className="compliance-breadcrumb">PPWR leveranciers</span>
                  <div className="packaging-dialog-title-row">
                    <h2>{draftPackagingSupplier.name || 'Nieuwe verpakkingsleverancier'}</h2>
                    <span className={`compliance-status-pill ${draftPackagingSupplier.active === false ? 'concept' : 'complete'}`}>
                      {draftPackagingSupplier.active === false ? 'Niet actief' : 'Actief'}
                    </span>
                  </div>
                </div>
                <div className="page-title-actions">
                  <button type="button" className="secondary-button" onClick={() => setPackagingDialogOpen(false)}>Sluiten</button>
                  <button type="button" className="secondary-button" onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, active: current.active === false } : current)}>
                    {draftPackagingSupplier.active === false ? 'Zet actief' : 'Zet niet actief'}
                  </button>
                  <button type="button" className="primary-button" onClick={() => void savePackagingSupplier()} disabled={saving || !draftPackagingSupplier.name.trim()}>
                    Opslaan
                  </button>
                </div>
              </div>

              <div className="compliance-panel-body compliance-view-stack packaging-dialog-content">
                <div className="compliance-progress-panel">
                  <div className="compliance-progress-header"><strong>PPWR-dossier volledigheid</strong><span>{ppwrProgress}%</span></div>
                  <div className="compliance-progress-track"><div className="compliance-progress-fill" style={{ width: `${ppwrProgress}%` }} /></div>
                  <div className="compliance-progress-missing">{ppwrMissingItems.length > 0 ? `Ontbreekt: ${ppwrMissingItems.join(', ')}` : 'Alle vereiste PPWR-gegevens zijn aanwezig.'}</div>
                </div>

                <div className="compliance-tabs">
                  {([
                    ['basic', 'Basisgegevens'],
                    ['profile', 'Verpakkingsprofiel'],
                    ['purchased', 'Ingekochte verpakkingen'],
                    ['documents', 'Documenten'],
                  ] as const).map(([id, label]) => <button key={id} type="button" className={packagingDetailTab === id ? 'active' : ''} onClick={() => setPackagingDetailTab(id)}>{label}</button>)}
                </div>

                {packagingDetailTab === 'basic' && (<>
                <details className="panel packaging-contact-details" open>
                  <summary className="panel-title">Basisgegevens leverancier <small>Gedeeld met Leveranciers · klik om te bewerken</small></summary>
                  <p className="packaging-section-explanation">Dit is hetzelfde leveranciersrecord als in de Leveranciers-module. Er bestaat geen aparte PPWR-kopie.</p>
                  <div className="compliance-form-grid">
                    <label>
                      <span>Bedrijfsnaam</span>
                      <input value={draftPackagingSupplier.name || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, name: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Contactpersoon</span>
                      <input value={draftPackagingSupplier.contactName || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, contactName: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>E-mail</span>
                      <input type="email" value={draftPackagingSupplier.email || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, email: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Telefoon</span>
                      <input value={draftPackagingSupplier.phone || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, phone: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Mobiel</span>
                      <input value={draftPackagingSupplier.mobile || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, mobile: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Website</span>
                      <input value={draftPackagingSupplier.website || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, website: event.target.value } : current)} />
                    </label>
                    <label className="span-2">
                      <span>Adres</span>
                      <input value={draftPackagingSupplier.address || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, address: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Postcode</span>
                      <input value={draftPackagingSupplier.postalCode || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, postalCode: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Plaats</span>
                      <input value={draftPackagingSupplier.city || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, city: event.target.value } : current)} />
                    </label>
                    <label className="packaging-country-field">
                      <span>Land</span>
                      <input value={draftPackagingSupplier.country || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, country: event.target.value } : current)} />
                    </label>
                  </div>
                </details>

                <section className="panel">
                  <div className="panel-title">PPWR-instellingen</div>
                  <div className="compliance-form-grid compact-ppwr-settings">
                    <label>
                      <span>PPWR rol</span>
                      <select value={draftPackagingSupplier.ppwrSupplierRole || 'productleverancier_niet_eu'} onChange={(event) => setDraftPackagingSupplier((current) => current ? {
                        ...current,
                        ppwrSupplierRole: event.target.value as Supplier['ppwrSupplierRole'],
                        herkomst: roleHerkomst(event.target.value as Supplier['ppwrSupplierRole']),
                        docStatus: current.docStatus ?? { status: 'niet_gevraagd', statusDatum: '' },
                        packagingProfile: current.packagingProfile ?? [],
                      } : current)}>
                        <option value="fabrikant_eu">Fabrikant in de EU</option>
                        <option value="distributeur_eu">Distributeur in de EU</option>
                        <option value="productleverancier_niet_eu">Productleverancier buiten de EU</option>
                      </select>
                    </label>
                    <label className="compliance-checkbox-label">
                      <input type="checkbox" checked={draftPackagingSupplier.isPackagingSupplier !== false} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, isPackagingSupplier: event.target.checked } : current)} />
                      <span>Actieve verpakkingsleverancier</span>
                    </label>
                  </div>
                </section>
                </>)}

                {packagingDetailTab === 'documents' && draftPackagingSupplier.herkomst === 'eu' && (
                  <section className="panel">
                    <div className="panel-title">Declaration of Conformity (DoC)</div>
                    <div className="compliance-form-grid">
                      <label><span>DoC-status</span><select value={draftPackagingSupplier.docStatus?.status || 'niet_gevraagd'} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, docStatus: { ...(current.docStatus ?? { statusDatum: '' }), status: event.target.value as NonNullable<Supplier['docStatus']>['status'] } } : current)}>
                        <option value="niet_gevraagd">Niet gevraagd</option><option value="gevraagd">Gevraagd</option><option value="toegezegd">Toegezegd</option><option value="ontvangen">Ontvangen</option><option value="kan_niet_leveren">Kan niet leveren</option>
                      </select></label>
                      <label><span>Statusdatum</span><input type="date" value={draftPackagingSupplier.docStatus?.statusDatum || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, docStatus: { ...(current.docStatus ?? { status: 'niet_gevraagd' }), statusDatum: event.target.value } } : current)} /></label>
                      {draftPackagingSupplier.docStatus?.status === 'toegezegd' ? <label><span>Toegezegd voor</span><input type="date" value={draftPackagingSupplier.docStatus?.toegezegdVoor || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, docStatus: { ...(current.docStatus ?? { status: 'toegezegd', statusDatum: '' }), toegezegdVoor: event.target.value } } : current)} /></label> : null}
                      <label><span>Bestandsnaam</span><input value={draftPackagingSupplier.docStatus?.bestandsnaam || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, docStatus: { ...(current.docStatus ?? { status: 'niet_gevraagd', statusDatum: '' }), bestandsnaam: event.target.value } } : current)} /></label>
                      <label className="span-2"><span>DoC-notitie</span><textarea value={draftPackagingSupplier.docStatus?.notitie || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, docStatus: { ...(current.docStatus ?? { status: 'niet_gevraagd', statusDatum: '' }), notitie: event.target.value } } : current)} /></label>
                    </div>
                  </section>
                )}
                {packagingDetailTab === 'profile' && draftPackagingSupplier.herkomst !== 'eu' && (
                  <section className="panel">
                    <div className="panel-title"><span>Verpakkingsprofiel</span><button type="button" className="secondary-button" onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: [...(current.packagingProfile ?? []), createPackagingProfileLayer()] } : current)}><Plus size={14} /> Laag toevoegen</button></div>
                    <p className="packaging-section-explanation">Gestructureerde materiaallagen voor PPWR-rapportage. Iedere fysieke materiaalcomponent is één laag; een samengestelde verpakking mag meerdere lagen met dezelfde naam hebben.</p>
                    <div className="supplier-profile-stack">
                      {(draftPackagingSupplier.packagingProfile ?? []).map((layer, index) => (
                        <div className="supplier-profile-layer" key={layer.id}>
                          <div className="supplier-profile-layer-title"><strong>{layer.naam?.trim() || `Laag ${index + 1}`}</strong><button type="button" className="danger-icon-button" aria-label={`${layer.naam?.trim() || `Laag ${index + 1}`} verwijderen`} onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).filter((item) => item.id !== layer.id) } : current)}><Trash2 size={16} /></button></div>
                          <div className="compliance-form-grid profile-grid">
                            <label><span>Naam / component</span><input value={layer.naam || ''} placeholder="Bijv. Blister variorollen" onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, naam: event.target.value } : item) } : current)} /></label>
                            <label><span>Rol</span><select value={layer.rol} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, rol: event.target.value as typeof layer.rol } : item) } : current)}><option value="primair">Primair</option><option value="secundair">Secundair</option><option value="transport">Transport</option></select></label>
                            <label><span>Materiaalcode</span><input value={layer.materiaalcode} placeholder="Bijv. PE-LD 04" onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, materiaalcode: event.target.value } : item) } : current)} /></label>
                            <label><span>Gewicht (g)</span><input type="number" min="0" step="0.01" value={layer.gewichtGram || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, gewichtGram: Number(event.target.value) } : item) } : current)} /></label>
                            <label><span>Gewichtsbasis</span><select value={layer.gewichtBasis} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, gewichtBasis: event.target.value as typeof layer.gewichtBasis } : item) } : current)}><option value="per_stuk">Per stuk</option><option value="per_doos">Per doos</option></select></label>
                            <label><span>Recyclaat (%)</span><input type="number" min="0" max="100" value={layer.recyclaatPercentage ?? ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, recyclaatPercentage: event.target.value === '' ? undefined : Number(event.target.value) } : item) } : current)} /></label>
                            <label><span>Zorgwekkende stoffen</span><select value={layer.zorgwekkendeStoffen} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, zorgwekkendeStoffen: event.target.value as typeof layer.zorgwekkendeStoffen } : item) } : current)}><option value="geen_bekend">Geen bekend</option><option value="onderzoek_loopt">Onderzoek loopt</option><option value="aanwezig">Aanwezig</option></select></label>
                            <label><span>Bron</span><select value={layer.bron} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, bron: event.target.value as typeof layer.bron } : item) } : current)}><option value="opgave_leverancier">Opgave leverancier</option><option value="eigen_meting">Eigen meting</option><option value="schatting">Schatting</option></select></label>
                            <label className="compliance-checkbox-label"><input type="checkbox" checked={layer.herbruikbaar} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingProfile: (current.packagingProfile ?? []).map((item) => item.id === layer.id ? { ...item, herbruikbaar: event.target.checked } : item) } : current)} /><span>Herbruikbaar</span></label>
                          </div>
                        </div>
                      ))}
                      {(draftPackagingSupplier.packagingProfile ?? []).length === 0 ? <p className="empty">Nog geen verpakkingslagen toegevoegd.</p> : null}
                    </div>
                  </section>
                )}

                {packagingDetailTab === 'purchased' && (<section className="panel">
                  <div className="panel-title">
                    <span>Ingekochte verpakkingen</span>
                    <div className="page-title-actions">
                      <button type="button" className="secondary-button" onClick={addCrazyLabelsFormats}><Plus size={14} /> Crazy Labels-formaten</button>
                      <button type="button" className="secondary-button" onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, packagingItems: [...(current.packagingItems ?? []), createPurchasedPackagingItem()] } : current)}><Plus size={14} /> Verpakking toevoegen</button>
                    </div>
                  </div>
                  <p className="packaging-section-explanation">Concrete inkooporders en verpakkingsartikelen van deze leverancier. Leg een artikel één keer vast; daarna kan het aan meerdere producten worden gekoppeld.</p>
                  <div className="supplier-profile-stack">
                    {(draftPackagingSupplier.packagingItems ?? []).map((item) => (
                      <article className="supplier-profile-layer" key={item.id}>
                        <div className="supplier-profile-layer-title"><strong>{item.orderNummer ? `Order ${item.orderNummer}` : 'Nieuwe ingekochte verpakking'}{item.artikelCode ? ` · ${item.artikelCode}` : ''}</strong><button type="button" className="danger-icon-button" aria-label="Ingekochte verpakking verwijderen" onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, packagingItems: (current.packagingItems ?? []).filter((entry) => entry.id !== item.id) } : current)}><Trash2 size={16} /></button></div>
                        <div className="compliance-form-grid profile-grid">
                          <label><span>Categorie</span><select value={item.categorie || 'overig'} onChange={(event) => updatePurchasedPackagingItem(item.id, { categorie: event.target.value as NonNullable<typeof item.categorie> })}><option value="productetiket">Productetiket</option><option value="overig">Overige verpakking</option></select></label>
                          <label><span>Ordernummer</span><input value={item.orderNummer} onChange={(event) => updatePurchasedPackagingItem(item.id, { orderNummer: event.target.value })} /></label>
                          <label><span>Besteld op</span><input type="date" value={item.besteldOp || ''} onChange={(event) => updatePurchasedPackagingItem(item.id, { besteldOp: event.target.value || undefined })} /></label>
                          <label><span>Artikelcode</span><input value={item.artikelCode} onChange={(event) => updatePurchasedPackagingItem(item.id, { artikelCode: event.target.value })} placeholder="Bijv. 00324" /></label>
                          <label><span>Omschrijving</span><input value={item.omschrijving} onChange={(event) => updatePurchasedPackagingItem(item.id, { omschrijving: event.target.value })} placeholder="Bijv. LDPE-zak" /></label>
                          <label><span>Afmetingen</span><input value={item.afmetingen || ''} onChange={(event) => updatePurchasedPackagingItem(item.id, { afmetingen: event.target.value || undefined })} placeholder="Bijv. 150 × 120 mm" /></label>
                          <label><span>Materiaalcode</span><input value={item.materiaalcode} onChange={(event) => updatePurchasedPackagingItem(item.id, { materiaalcode: event.target.value })} placeholder="Bijv. PE-LD 04" /></label>
                          <label><span>Gewicht (g)</span><input type="number" min="0" step="0.01" value={item.gewichtGram || ''} onChange={(event) => updatePurchasedPackagingItem(item.id, { gewichtGram: Number(event.target.value) })} /></label>
                          <label><span>Gewichtsbasis</span><select value={item.gewichtBasis} onChange={(event) => updatePurchasedPackagingItem(item.id, { gewichtBasis: event.target.value as typeof item.gewichtBasis })}><option value="per_stuk">Per stuk</option><option value="per_doos">Per doos</option></select></label>
                          <label><span>Aantal ingekocht</span><input type="number" min="0" step="1" value={item.aantalIngekocht ?? ''} onChange={(event) => updatePurchasedPackagingItem(item.id, { aantalIngekocht: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
                          <label><span>Recyclaat (%)</span><input type="number" min="0" max="100" value={item.recyclaatPercentage ?? ''} onChange={(event) => updatePurchasedPackagingItem(item.id, { recyclaatPercentage: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
                          <label><span>Zorgwekkende stoffen</span><select value={item.zorgwekkendeStoffen} onChange={(event) => updatePurchasedPackagingItem(item.id, { zorgwekkendeStoffen: event.target.value as typeof item.zorgwekkendeStoffen })}><option value="geen_bekend">Geen bekend</option><option value="onderzoek_loopt">Onderzoek loopt</option><option value="aanwezig">Aanwezig</option></select></label>
                          <label><span>Bron</span><select value={item.bron} onChange={(event) => updatePurchasedPackagingItem(item.id, { bron: event.target.value as typeof item.bron })}><option value="opgave_leverancier">Opgave leverancier</option><option value="eigen_meting">Eigen meting</option><option value="schatting">Schatting</option></select></label>
                          <label className="compliance-checkbox-label"><input type="checkbox" checked={item.herbruikbaar} onChange={(event) => updatePurchasedPackagingItem(item.id, { herbruikbaar: event.target.checked })} /><span>Herbruikbaar</span></label>
                          <label className="compliance-checkbox-label"><input type="checkbox" checked={item.actief} onChange={(event) => updatePurchasedPackagingItem(item.id, { actief: event.target.checked })} /><span>Actief artikel</span></label>
                          <div className="span-2 packaging-item-document-summary">
                            <strong>Documentatie</strong>
                            <span>{(draftPackagingSupplier.ppwrDocuments ?? []).filter((document) => document.packagingItemIds?.includes(item.id)).map((document) => document.fileName).join(', ') || 'Nog geen document aan dit artikel gekoppeld'}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                    {(draftPackagingSupplier.packagingItems ?? []).length === 0 ? <p className="empty">Nog geen ingekochte verpakkingen vastgelegd.</p> : null}
                  </div>
                </section>)}

                {packagingDetailTab === 'documents' && (<>
                  <section className="panel">
                    <div className="panel-title">
                      <span>Documenten ({draftPackagingSupplier.ppwrDocuments?.length ?? 0})</span>
                      <label className="secondary-button supplier-document-upload"><Plus size={14} /> Document<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addSupplierDocument(file); event.currentTarget.value = ''; }} /></label>
                    </div>
                    {supplierDocumentMessage ? <div className="inline-notice">{supplierDocumentMessage}</div> : null}
                    <div className="supplier-document-list">
                      {(draftPackagingSupplier.ppwrDocuments ?? []).map((document) => (
                        <div className="supplier-document-row" key={document.id}>
                          <FileText size={18} />
                          <div>
                            <strong>{document.fileName}</strong>
                            <span>Geüpload op {formatDateTime(document.uploadedAt)}</span>
                            <div className="supplier-document-item-links">
                              {(draftPackagingSupplier.packagingItems ?? []).map((item) => (
                                <label key={`${document.id}-${item.id}`} className="supplier-document-item-link">
                                  <input
                                    type="checkbox"
                                    checked={document.packagingItemIds?.includes(item.id) ?? false}
                                    onChange={(event) => toggleSupplierDocumentPackagingItem(document.id, item.id, event.target.checked)}
                                  />
                                  <span>{item.artikelCode || item.omschrijving || 'Verpakkingsartikel'}</span>
                                </label>
                              ))}
                              {(draftPackagingSupplier.packagingItems?.length ?? 0) === 0 ? <span>Voeg eerst een ingekocht verpakkingsartikel toe.</span> : null}
                            </div>
                          </div>
                          <button type="button" className="icon-button danger" aria-label={`${document.fileName} verwijderen`} onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, ppwrDocuments: (current.ppwrDocuments ?? []).filter((item) => item.id !== document.id) } : current)}><Trash2 size={15} /></button>
                        </div>
                      ))}
                      {(draftPackagingSupplier.ppwrDocuments?.length ?? 0) === 0 ? <p className="empty">Nog geen documenten gekoppeld.</p> : null}
                    </div>
                  </section>
                  <section className="panel"><div className="panel-title">Documentnotities</div><div className="compliance-form-grid"><label className="span-2"><span>Leveranciersnotities</span><textarea value={draftPackagingSupplier.ppwrNotes || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrNotes: event.target.value } : current)} /></label></div></section>
                </>)}

                {packagingDetailTab === 'profile' && (<section className="panel">
                  <div className="panel-title">Gekoppelde producten</div>
                  <div className="compliance-linked-products-table">
                    <div className="compliance-linked-products-header">
                      <span>Artikelnummer</span>
                      <span>Omschrijving</span>
                      <span>Materialen</span>
                      <span className="numeric">Verpakking (g/{profileBasisLabel})</span>
                    </div>
                    {(selectedUsage?.products ?? []).map((product) => (
                      <button key={product.id} type="button" className="compliance-linked-products-row compliance-linked-products-button" onClick={() => onSelectProduct(product, 'gpsr')}>
                        <strong>{product.code || '-'}</strong>
                        <span>{product.description || '-'}</span>
                        <span>{Array.from(selectedUsage?.materials ?? []).join(', ') || '-'}</span>
                        <span className="numeric">{product.packagingWeightTotalGrams || product.packagingWeightPrimaryGrams || '-'}</span>
                      </button>
                    ))}
                    {(selectedUsage?.products.length ?? 0) > 0 ? <div className="compliance-linked-products-total"><strong>Totaal</strong><strong className="numeric">{linkedProductWeightTotal.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}</strong></div> : null}
                    {(selectedUsage?.products.length ?? 0) === 0 ? <p className="empty">Nog geen producten gekoppeld aan deze leverancier.</p> : null}
                  </div>
                </section>)}
              </div>
            </>
          )}
        </section>
        </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="compliance-module-shell">
      <div className="compliance-main">
        <div className="page-title-row compliance-dashboard-header">
          <div>
            <h1>GPSR Compliance Dashboard</h1>
            <span>Overzicht van families, dossiers en productkoppelingen.</span>
          </div>
          {moduleView === 'dashboard' ? (
            <button type="button" className="primary-button" onClick={() => void handleSeedTemplates()} disabled={saving}>
              <Plus size={14} /> Templates laden
            </button>
          ) : null}
        </div>

        <div className="panel compliance-topnav-panel">
          <div className="compliance-topnav">
            <button type="button" className={moduleView === 'dashboard' ? 'active' : ''} onClick={() => setModuleView('dashboard')}>
              <LayoutDashboard size={15} />
              <span>Dashboard</span>
            </button>
            <button type="button" className={moduleView === 'families' ? 'active' : ''} onClick={() => setModuleView('families')}>
              <FolderKanban size={15} />
              <span>Productfamilies</span>
            </button>
            <button type="button" onClick={createNewFamily}>
              <Plus size={15} />
              <span>Nieuwe familie</span>
            </button>
            <button type="button" className={moduleView === 'unlinked' ? 'active' : ''} onClick={() => setModuleView('unlinked')}>
              <PackageSearch size={15} />
              <span>Producten</span>
            </button>
            <button type="button" className={moduleView === 'templates' ? 'active' : ''} onClick={() => setModuleView('templates')}>
              <DatabaseZap size={15} />
              <span>Templates laden</span>
            </button>
            <button type="button" className={moduleView === 'packagingSuppliers' ? 'active' : ''} onClick={() => setModuleView('packagingSuppliers')}>
              <ShieldCheck size={15} />
              <span>PPWR leveranciers</span>
            </button>
          </div>
        </div>

        {message ? <div className="inline-notice success-notice">{message}</div> : null}

        {moduleView === 'dashboard' && renderDashboard()}
        {moduleView === 'families' && renderFamiliesView()}
        {moduleView === 'unlinked' && renderUnlinkedProductsView()}
        {moduleView === 'documents' && renderDocumentsView()}
        {moduleView === 'templates' && renderTemplatesView()}
        {moduleView === 'packagingSuppliers' && renderPackagingSuppliersView()}
      </div>
    </div>
  );
}
