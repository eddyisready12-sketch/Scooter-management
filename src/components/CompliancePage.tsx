import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  FileText,
  FolderKanban,
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
  Product,
  Supplier,
} from '../types';

type ComplianceModuleView = 'dashboard' | 'families' | 'unlinked' | 'documents' | 'templates' | 'packagingSuppliers';
type ComplianceDetailTab = 'basic' | 'risks' | 'warnings' | 'requirements' | 'tests' | 'documents' | 'links' | 'revisions' | 'dossier';
type ComplianceDashboardTab = 'incomplete' | 'outsourced' | 'highRisk' | 'requirements' | 'tests' | 'missingDocuments' | 'expiringDocuments' | 'expiredDocuments';

type CompliancePageProps = {
  products: Product[];
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
  { id: 'dossier', label: 'Dossier genereren' },
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
  message,
  onSeedTemplates,
  onSaveFamilyBundle,
  onAutoLinkProducts,
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
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('');
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkPage, setLinkPage] = useState(1);
  const [documentQuery, setDocumentQuery] = useState('');
  const [unlinkedQuery, setUnlinkedQuery] = useState('');
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
    setFamilyDialogOpen(true);
  }

  const outsourcedProducts = useMemo(() => products.filter((product) => productIsOutsourced(product, suppliers)), [products, suppliers]);
  const outsourcedProductIds = useMemo(() => new Set(outsourcedProducts.map((product) => product.id)), [outsourcedProducts]);
  const dossierLinks = useMemo(() => links.filter((link) => !outsourcedProductIds.has(link.productId)), [links, outsourcedProductIds]);
  const familyRows = useMemo(() => families.map((family) => ({
    family,
    stats: getComplianceFamilyStats(family, risks, warnings, documents, requirements, testPlans, tests, dossierLinks),
  })), [documents, families, dossierLinks, requirements, risks, testPlans, tests, warnings]);

  const filteredFamilies = useMemo(() => familyRows.filter(({ family, stats }) => {
    const haystack = `${family.code} ${family.name} ${family.category ?? ''}`.toLowerCase();
    const matchesQuery = haystack.includes(familyQuery.toLowerCase());
    const matchesCategory = familyCategoryFilter === 'all' || (family.category || '') === familyCategoryFilter;
    const matchesStatus = familyStatusFilter === 'all' || (stats.calculatedStatus || 'concept') === familyStatusFilter;
    return matchesQuery && matchesCategory && matchesStatus;
  }), [familyCategoryFilter, familyQuery, familyRows, familyStatusFilter]);

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
    const nextLinks = [...draftLinks, {
      id: createComplianceEntityId('compliance-link'),
      familyId: draftFamily.id,
      productId: product.id,
      variantDescription: product.articleGroup || '',
      status: 'active' as const,
      linkedBy: 'handmatig',
      createdAt: timestamp,
      updatedAt: timestamp,
    }];
    const nextRevisions = [{
      id: createComplianceEntityId('compliance-revision'),
      familyId: draftFamily.id,
      changeNote: `Product gekoppeld (${product.code || product.id})`,
      createdAt: timestamp,
    }, ...draftRevisions];

    setDraftLinks(nextLinks);
    setDraftRevisions(nextRevisions);
    setProductSearch('');
    await saveFamilyBundle({ links: nextLinks, revisions: nextRevisions });
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
    const timestamp = new Date().toISOString();
    const nextLinks = draftLinks.map((link) => (
      link.id === linkId
        ? {
          ...link,
          status: 'inactive' as const,
          updatedAt: timestamp,
        }
        : link
    ));
    const nextRevisions = [{
      id: createComplianceEntityId('compliance-revision'),
      familyId: draftFamily.id,
      changeNote: removedLink?.productId ? `Product ontkoppeld (${removedLink.productId})` : 'Product ontkoppeld',
      createdAt: timestamp,
    }, ...draftRevisions];

    setDraftLinks(nextLinks);
    setDraftRevisions(nextRevisions);
    await saveFamilyBundle({
      links: nextLinks,
      revisions: nextRevisions,
    });
  }

  function openDossierPreview() {
    if (!draftFamily) return;
    const riskRows = draftRisks.map((risk) => {
      const score = asNumber(risk.severity) * asNumber(risk.probability);
      return `<tr>
        <td>${escapeHtml(risk.hazard)}</td>
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
    const linkedRows = selectedFamilyProducts.map(({ product }) => `
      <tr>
        <td>${escapeHtml(product?.code || '-')}</td>
        <td>${escapeHtml(product?.description || '-')}</td>
        <td>${escapeHtml(product?.articleGroup || '-')}</td>
      </tr>
    `).join('');
    const documentRows = draftDocuments.map((document) => `
      <tr>
        <td>${escapeHtml(document.documentType || '-')}</td>
        <td>${escapeHtml(document.documentName)}</td>
        <td>${escapeHtml(formatDate(document.validUntil))}</td>
      </tr>
    `).join('');

    const previewWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!previewWindow) return;
    previewWindow.document.open();
    previewWindow.document.write(`
      <html>
        <head>
          <title>GPSR Technisch Dossier</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1, h2 { color: #0b4a8f; }
            h1 { font-size: 28px; margin-bottom: 12px; }
            .hero { border: 1px solid #1d4f91; background: #eef4ff; padding: 18px; margin-bottom: 24px; }
            .hero-grid { width: 100%; border-collapse: collapse; margin-top: 12px; }
            .hero-grid td { padding: 8px 10px; border-bottom: 1px solid #dbe6f5; }
            .section { margin-top: 28px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d6dce2; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #103f77; color: white; }
            .warning-card { border: 1px solid #f5c451; background: #fff7da; padding: 12px; margin-bottom: 10px; }
            .print-button { float: right; background: #0b4a8f; color: white; border: 0; border-radius: 6px; padding: 10px 14px; cursor: pointer; }
          </style>
        </head>
        <body>
          <button class="print-button" onclick="window.print()">Afdrukken / PDF</button>
          <div class="hero">
            <h1>GPSR Technisch Dossier</h1>
            <table class="hero-grid">
              <tr><td><strong>Productfamilie</strong></td><td>${escapeHtml(draftFamily.name)}</td><td><strong>Code</strong></td><td>${escapeHtml(draftFamily.code)}</td></tr>
              <tr><td><strong>Categorie</strong></td><td>${escapeHtml(draftFamily.category || '-')}</td><td><strong>Risiconiveau</strong></td><td>${escapeHtml(riskLabel(draftFamily.riskLevel))}</td></tr>
              <tr><td><strong>Datum gegenereerd</strong></td><td>${escapeHtml(formatDate(new Date().toISOString()))}</td><td><strong>Aantal producten</strong></td><td>${selectedFamilyProducts.length}</td></tr>
            </table>
          </div>
          <div class="section"><h2>1. Productomschrijving</h2><p>${escapeHtml(draftFamily.description || '-')}</p></div>
          <div class="section"><h2>2. Bedoeld gebruik</h2><p>${escapeHtml(draftFamily.intendedUse || '-')}</p></div>
          <div class="section"><h2>3. Voorzienbaar verkeerd gebruik</h2><p>${escapeHtml(draftFamily.foreseeableMisuse || '-')}</p></div>
          <div class="section"><h2>4. Risicoanalyse</h2><table><thead><tr><th>Gevaar</th><th>Ernst</th><th>Kans</th><th>Score</th><th>Mitigatie</th><th>Resterend risico</th></tr></thead><tbody>${riskRows || '<tr><td colspan="6">Geen risicoanalyse vastgelegd.</td></tr>'}</tbody></table></div>
          <div class="section"><h2>5. Waarschuwingen</h2>${warningCards || '<p>Geen waarschuwingen vastgelegd.</p>'}</div>
          <div class="section"><h2>6. Gekoppelde producten (${selectedFamilyProducts.length})</h2><table><thead><tr><th>Artikelnummer</th><th>Omschrijving</th><th>Categorie</th></tr></thead><tbody>${linkedRows || '<tr><td colspan="3">Geen producten gekoppeld.</td></tr>'}</tbody></table></div>
          <div class="section"><h2>7. Documenten</h2><table><thead><tr><th>Type</th><th>Naam</th><th>Geldig t/m</th></tr></thead><tbody>${documentRows || '<tr><td colspan="3">Geen documenten geregistreerd.</td></tr>'}</tbody></table></div>
        </body>
      </html>
    `);
    previewWindow.document.close();
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
    const selectedStats = draftFamily ? getComplianceFamilyStats(draftFamily, draftRisks, draftWarnings, draftDocuments, draftRequirements, draftTestPlans, draftTests, draftLinks) : null;

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
                  <th>Code</th>
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
                    <td><strong>{family.code || '-'}</strong></td>
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
                    <td>{stats.activeLinks}</td>
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
                    <td colSpan={7}><p className="empty">Geen productfamilies gevonden voor deze filters.</p></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {familyDialogOpen && draftFamily ? (
        <div className="modal-backdrop compliance-detail-dialog-backdrop" onMouseDown={() => setFamilyDialogOpen(false)}>
        <section className="panel compliance-family-detail compliance-detail-dialog" ref={familyDetailRef} onMouseDown={(event) => event.stopPropagation()}>
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
                  <button type="button" className="primary-button" onClick={openDossierPreview}>Dossier genereren</button>
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
                        <div className="compliance-form-grid">
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
                          <label>
                            <span>Fabrikant / verantwoordelijke</span>
                            <input value={draftFamily.manufacturerName || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, manufacturerName: event.target.value } : current)} />
                          </label>
                          <label>
                            <span>Contact fabrikant / EU verantwoordelijke</span>
                            <textarea value={draftFamily.manufacturerContact || ''} onChange={(event) => setDraftFamily((current) => current ? { ...current, manufacturerContact: event.target.value } : current)} rows={3} />
                          </label>
                        </div>
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
                      <div className="compliance-grid-table">
                        {draftRisks.map((risk, index) => (
                          <div className="compliance-card-row" key={risk.id}>
                            <input value={risk.hazard} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, hazard: event.target.value } : item))} placeholder="Gevaar" />
                            <input value={risk.riskDescription || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, riskDescription: event.target.value } : item))} placeholder="Beschrijving" />
                            <input value={risk.mitigation || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, mitigation: event.target.value } : item))} placeholder="Mitigatie" />
                            <input value={risk.severity || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, severity: event.target.value } : item))} placeholder="Ernst" />
                            <input value={risk.probability || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, probability: event.target.value } : item))} placeholder="Kans" />
                            <input value={risk.residualRisk || ''} onChange={(event) => setDraftRisks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, residualRisk: event.target.value } : item))} placeholder="Rest" />
                            <div className="compliance-score-cell">{asNumber(risk.severity) * asNumber(risk.probability)}</div>
                            <button type="button" className="icon-button danger" onClick={() => setDraftRisks((current) => current.filter((item) => item.id !== risk.id))}><Trash2 size={14} /></button>
                          </div>
                        ))}
                        {draftRisks.length === 0 ? <p className="empty">Nog geen risico's toegevoegd.</p> : null}
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
                      <div className="compliance-grid-table">
                        {draftTestPlans.map((plan, index) => {
                          const fulfilled = testPlanFulfilled(plan, draftTests);
                          return (
                            <div className="compliance-document-row" key={plan.id}>
                              <input value={plan.name} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Naam testplan" />
                              <input value={plan.frequency || ''} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, frequency: event.target.value } : item))} placeholder="Frequentie" />
                              <label className="checkbox-label small"><input type="checkbox" checked={plan.mandatory ?? true} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, mandatory: event.target.checked } : item))} /><span>Verplicht</span></label>
                              <span className={`compliance-inline-status ${fulfilled ? 'success' : 'warning'}`}>{fulfilled ? 'Geslaagd' : 'Open'}</span>
                              <button type="button" className="icon-button danger" onClick={() => setDraftTestPlans((current) => current.filter((item) => item.id !== plan.id))}><Trash2 size={14} /></button>
                              <textarea value={plan.method || ''} onChange={(event) => setDraftTestPlans((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method: event.target.value } : item))} placeholder="Methode / acceptatiecriteria" rows={2} />
                              <button type="button" className="secondary-button" onClick={() => addTest(plan.id)}>+ Test op dit plan</button>
                            </div>
                          );
                        })}
                        {draftTestPlans.length === 0 ? <p className="empty">Nog geen testplannen toegevoegd.</p> : null}
                      </div>

                      <div className="compliance-grid-table">
                        {draftTests.map((test, index) => (
                          <div className="compliance-document-row" key={test.id}>
                            <input type="date" value={test.testDate} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, testDate: event.target.value } : item))} />
                            <select value={test.planId || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, planId: event.target.value || undefined } : item))}>
                              <option value="">Losse test</option>
                              {draftTestPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name || 'Onbenoemd plan'}</option>)}
                            </select>
                            <select value={test.result || 'pass'} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, result: event.target.value as ComplianceProductTest['result'] } : item))}>
                              <option value="pass">Pass</option>
                              <option value="fail">Fail</option>
                              <option value="conditional">Conditional</option>
                            </select>
                            <input value={test.testedBy || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, testedBy: event.target.value } : item))} placeholder="Getest door" />
                            <input value={test.batchRef || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, batchRef: event.target.value } : item))} placeholder="Batch / orderref" />
                            <button type="button" className="icon-button danger" onClick={() => setDraftTests((current) => current.filter((item) => item.id !== test.id))}><Trash2 size={14} /></button>
                            <textarea value={test.findings || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, findings: event.target.value } : item))} placeholder="Bevindingen" rows={2} />
                            <textarea value={test.correctiveAction || ''} onChange={(event) => setDraftTests((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, correctiveAction: event.target.value } : item))} placeholder="Corrigerende actie" rows={2} />
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
                              {product ? <button type="button" className="secondary-button compliance-row-action-button" onClick={() => onSelectProduct(product, 'gpsr')}>Open product</button> : null}
                              <button type="button" className="danger-button compliance-row-action-button" onClick={() => void deactivateLink(link.id)} disabled={saving}>Ontkoppel</button>
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
                        <button type="button" className="primary-button" onClick={openDossierPreview}>Afdrukken / PDF</button>
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
      </div>
    );
  }

  function renderUnlinkedProductsView() {
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
            <div className="search-field">
              <Search size={16} />
              <input value={unlinkedQuery} onChange={(event) => setUnlinkedQuery(event.target.value)} placeholder="Zoeken op artikelnummer, omschrijving of categorie" />
            </div>
            <div className="compliance-linked-products-table">
              <div className="compliance-linked-products-header">
                <span>Artikelnummer</span>
                <span>Naam</span>
                <span>Categorie</span>
                <span>Suggestie</span>
              </div>
              {productsWithoutFamily.map((product) => {
                const suggestion = unlinkedSuggestions.find((item) => item.productId === product.id);
                const family = suggestion ? families.find((item) => item.id === suggestion.familyId) : null;
                return (
                  <div className="compliance-linked-products-row" key={product.id}>
                    <strong>{product.code || '-'}</strong>
                    <span>{product.description || '-'}</span>
                    <span>{product.articleGroup || '-'}</span>
                    <span>{family ? `${family.code} - ${family.name}` : 'Geen suggestie'}</span>
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
    return (
      <div className="compliance-view-stack">
        <section className="panel">
          <div className="panel-title">
            <span>Templates</span>
            <button type="button" className="primary-button" onClick={() => void handleSeedTemplates()} disabled={saving}>
              <DatabaseZap size={14} /> Templates laden
            </button>
          </div>
          <div className="compliance-panel-body">
            <div className="compliance-template-grid">
              {templateSummary.families.map((family) => {
                const templateRiskCount = templateSummary.risks.filter((item) => item.familyId === family.id).length;
                const templateWarningCount = templateSummary.warnings.filter((item) => item.familyId === family.id).length;
                return (
                  <article key={family.id} className="compliance-template-card">
                    <div className="compliance-template-card-header">
                      <strong>{family.code}</strong>
                      <span className={`compliance-badge ${family.riskLevel === 'high' || family.riskLevel === 'critical' ? 'danger' : family.riskLevel === 'medium' ? 'warning' : 'success'}`}>{riskLabel(family.riskLevel)}</span>
                    </div>
                    <h3>{family.name}</h3>
                    <p>{family.description || 'Geen omschrijving'}</p>
                    <div className="compliance-template-stats">
                      <span>{templateRiskCount} risico's</span>
                      <span>{templateWarningCount} waarschuwingen</span>
                    </div>
                  </article>
                );
              })}
            </div>
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
        <section className="panel compliance-family-detail compliance-detail-dialog" ref={packagingDetailRef} onMouseDown={(event) => event.stopPropagation()}>
          {!draftPackagingSupplier ? (
            <p className="empty compliance-empty">Kies links een verpakkingsleverancier of maak een nieuwe kaart aan.</p>
          ) : (
            <>
              <div className="panel-title compliance-family-detail-header">
                <div>
                  <span className="compliance-breadcrumb">PPWR leveranciers</span>
                  <h2>{draftPackagingSupplier.name || 'Nieuwe verpakkingsleverancier'}</h2>
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

              <div className="compliance-panel-body compliance-view-stack">
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
                    <label>
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
                  <div className="panel-title"><span>Ingekochte verpakkingen</span><button type="button" className="secondary-button" onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, packagingItems: [...(current.packagingItems ?? []), createPurchasedPackagingItem()] } : current)}><Plus size={14} /> Verpakking toevoegen</button></div>
                  <p className="packaging-section-explanation">Concrete inkooporders en verpakkingsartikelen van deze leverancier. Leg een artikel één keer vast; daarna kan het aan meerdere producten worden gekoppeld.</p>
                  <div className="supplier-profile-stack">
                    {(draftPackagingSupplier.packagingItems ?? []).map((item) => (
                      <article className="supplier-profile-layer" key={item.id}>
                        <div className="supplier-profile-layer-title"><strong>{item.orderNummer ? `Order ${item.orderNummer}` : 'Nieuwe ingekochte verpakking'}{item.artikelCode ? ` · ${item.artikelCode}` : ''}</strong><button type="button" className="danger-icon-button" aria-label="Ingekochte verpakking verwijderen" onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, packagingItems: (current.packagingItems ?? []).filter((entry) => entry.id !== item.id) } : current)}><Trash2 size={16} /></button></div>
                        <div className="compliance-form-grid profile-grid">
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
                          <div><strong>{document.fileName}</strong><span>Geüpload op {formatDateTime(document.uploadedAt)}</span></div>
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
