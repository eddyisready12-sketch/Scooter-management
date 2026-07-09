import { useEffect, useMemo, useState } from 'react';
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
} from '../lib/compliance';
import type {
  ComplianceFamilyDocument,
  ComplianceFamilyRisk,
  ComplianceFamilyWarning,
  ComplianceProductFamily,
  ComplianceProductLink,
  Product,
  Supplier,
} from '../types';

type ComplianceModuleView = 'dashboard' | 'families' | 'unlinked' | 'documents' | 'templates' | 'packagingSuppliers';
type ComplianceDetailTab = 'basic' | 'risks' | 'warnings' | 'documents' | 'links' | 'dossier';

type CompliancePageProps = {
  products: Product[];
  families: ComplianceProductFamily[];
  risks: ComplianceFamilyRisk[];
  warnings: ComplianceFamilyWarning[];
  documents: ComplianceFamilyDocument[];
  links: ComplianceProductLink[];
  suppliers: Supplier[];
  message?: string;
  onSeedTemplates: (seed: ReturnType<typeof buildComplianceTemplateSeed>) => Promise<void>;
  onSaveFamilyBundle: (payload: {
    family: ComplianceProductFamily;
    risks: ComplianceFamilyRisk[];
    warnings: ComplianceFamilyWarning[];
    documents: ComplianceFamilyDocument[];
    links: ComplianceProductLink[];
  }) => Promise<void>;
  onAutoLinkProducts: (links: ComplianceProductLink[]) => Promise<void>;
  onSavePackagingSupplier: (supplier: Supplier) => Promise<void>;
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
  { id: 'documents', label: 'Documenten' },
  { id: 'links', label: 'Gekoppelde producten' },
  { id: 'dossier', label: 'Dossier genereren' },
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

function packagingSupplierProfileReady(supplier?: Supplier) {
  if (!supplier || supplier.active === false || supplier.isPackagingSupplier !== true) return false;
  return Boolean(
    supplier.packagingMaterials?.trim()
    && supplier.ppwrSupplierRole
    && supplier.ppwrResponsibility
    && supplier.ppwrContractStatus === 'Actief'
    && (supplier.ppwrDeclarationStatus === 'Ontvangen' || supplier.ppwrDeclarationStatus === 'Goedgekeurd'),
  );
}

function packagingSupplierContractLabel(value?: Supplier['ppwrContractStatus']) {
  return value || 'Niet gestart';
}

function packagingSupplierDeclarationLabel(value?: Supplier['ppwrDeclarationStatus']) {
  return value || 'Ontbreekt';
}

export function CompliancePage({
  products,
  families,
  risks,
  warnings,
  documents,
  links,
  suppliers,
  message,
  onSeedTemplates,
  onSaveFamilyBundle,
  onAutoLinkProducts,
  onSavePackagingSupplier,
  onSelectProduct,
}: CompliancePageProps) {
  const [moduleView, setModuleView] = useState<ComplianceModuleView>('dashboard');
  const [detailTab, setDetailTab] = useState<ComplianceDetailTab>('basic');
  const [familyQuery, setFamilyQuery] = useState('');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkPage, setLinkPage] = useState(1);
  const [documentQuery, setDocumentQuery] = useState('');
  const [unlinkedQuery, setUnlinkedQuery] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [selectedPackagingSupplierKey, setSelectedPackagingSupplierKey] = useState('');
  const [draftPackagingSupplier, setDraftPackagingSupplier] = useState<Supplier | null>(null);
  const [draftFamily, setDraftFamily] = useState<ComplianceProductFamily | null>(null);
  const [draftRisks, setDraftRisks] = useState<ComplianceFamilyRisk[]>([]);
  const [draftWarnings, setDraftWarnings] = useState<ComplianceFamilyWarning[]>([]);
  const [draftDocuments, setDraftDocuments] = useState<ComplianceFamilyDocument[]>([]);
  const [draftLinks, setDraftLinks] = useState<ComplianceProductLink[]>([]);

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
    setDraftLinks(links.filter((item) => item.familyId === selectedFamilyId).map((item) => ({ ...item })));
    setLinkPage(1);
  }, [documents, families, links, risks, selectedFamilyId, warnings]);

  const familyRows = useMemo(() => families.map((family) => ({
    family,
    stats: getComplianceFamilyStats(family, risks, warnings, documents, links),
  })), [documents, families, links, risks, warnings]);

  const filteredFamilies = useMemo(() => familyRows.filter(({ family }) => {
    const haystack = `${family.code} ${family.name} ${family.category ?? ''}`.toLowerCase();
    return haystack.includes(familyQuery.toLowerCase());
  }), [familyQuery, familyRows]);

  const linkedProductIds = useMemo(() => new Set(
    links.filter((link) => (link.status ?? 'active') === 'active').map((link) => link.productId),
  ), [links]);

  const productsWithoutFamily = useMemo(() => products.filter((product) => {
    if (!product.id || linkedProductIds.has(product.id)) return false;
    const haystack = `${product.code} ${product.description} ${product.articleGroup ?? ''} ${product.brand ?? ''}`.toLowerCase();
    return haystack.includes(unlinkedQuery.toLowerCase());
  }), [linkedProductIds, products, unlinkedQuery]);

  const expiringDocuments = useMemo(() => documents.filter((document) => expiryState(document.validUntil) === 'soon'), [documents]);
  const expiredDocuments = useMemo(() => documents.filter((document) => expiryState(document.validUntil) === 'expired'), [documents]);
  const incompleteFamilies = useMemo(() => familyRows.filter((row) => row.stats.calculatedStatus !== 'complete' && row.stats.calculatedStatus !== 'not_applicable'), [familyRows]);
  const highRiskFamilies = useMemo(() => familyRows.filter((row) => row.family.riskLevel === 'high' || row.family.riskLevel === 'critical'), [familyRows]);

  const totals = useMemo(() => familyRows.reduce((summary, row) => {
    summary.families += 1;
    summary.linkedProducts += row.stats.activeLinks;
    summary.complete += row.stats.calculatedStatus === 'complete' ? 1 : 0;
    return summary;
  }, {
    families: 0,
    linkedProducts: 0,
    complete: 0,
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

  const packagingSupplierRows = useMemo<Array<{
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
      .map((supplier) => {
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

    return rows
      .filter((row) => {
        const needle = supplierQuery.trim().toLowerCase();
        if (!needle) return true;
        const haystack = `${row.supplier?.name ?? row.usage?.name ?? ''} ${row.supplier?.packagingMaterials ?? ''} ${Array.from(row.usage?.materials ?? []).join(' ')}`.toLowerCase();
        return haystack.includes(needle);
      })
      .sort((left, right) => {
        const leftReady = Number(left.isReady);
        const rightReady = Number(right.isReady);
        if (rightReady !== leftReady) return rightReady - leftReady;
        const leftUsage = left.usage?.products.length ?? 0;
        const rightUsage = right.usage?.products.length ?? 0;
        if (rightUsage !== leftUsage) return rightUsage - leftUsage;
        return (left.supplier?.name ?? left.usage?.name ?? '').localeCompare((right.supplier?.name ?? right.usage?.name ?? ''), 'nl', { sensitivity: 'base' });
      });
  }, [packagingSupplierUsageRows, supplierQuery, suppliers]);

  const packagingSupplierTotals = useMemo(() => packagingSupplierRows.reduce((summary, row) => {
    summary.total += 1;
    if (row.supplier) summary.linked += 1;
    if (row.isReady) summary.ready += 1;
    if (!row.supplier) summary.missing += 1;
    return summary;
  }, {
    total: 0,
    linked: 0,
    ready: 0,
    missing: 0,
  }), [packagingSupplierRows]);

  useEffect(() => {
    if (!selectedPackagingSupplierKey && packagingSupplierRows[0]?.key) {
      setSelectedPackagingSupplierKey(packagingSupplierRows[0].key);
    }
  }, [packagingSupplierRows, selectedPackagingSupplierKey]);

  useEffect(() => {
    const selectedRow = packagingSupplierRows.find((row) => row.key === selectedPackagingSupplierKey);
    if (!selectedRow) return;
    if (selectedRow.supplier) {
      setDraftPackagingSupplier({ ...selectedRow.supplier });
      return;
    }
    setDraftPackagingSupplier({
      id: createComplianceEntityId('packaging-supplier'),
      name: selectedRow.usage?.name ?? '',
      isPackagingSupplier: true,
      active: true,
      packagingMaterials: Array.from(selectedRow.usage?.materials ?? []).join(', '),
    });
  }, [packagingSupplierRows, selectedPackagingSupplierKey]);

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
    });
    setDraftRisks([]);
    setDraftWarnings([]);
    setDraftDocuments([]);
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

  function addProductLink(product: Product) {
    if (!draftFamily || !product.id) return;
    setDraftLinks((current) => {
      if (current.some((link) => link.productId === product.id && (link.status ?? 'active') === 'active')) {
        return current;
      }
      return [...current, {
        id: createComplianceEntityId('compliance-link'),
        familyId: draftFamily.id,
        productId: product.id,
        variantDescription: product.articleGroup || '',
        status: 'active',
        linkedBy: 'handmatig',
      }];
    });
    setProductSearch('');
  }

  function deactivateLink(linkId: string) {
    setDraftLinks((current) => current.map((link) => (link.id === linkId ? { ...link, status: 'inactive' } : link)));
  }

  async function saveFamilyBundle() {
    if (!draftFamily) return;
    setSaving(true);
    try {
      await onSaveFamilyBundle({
        family: draftFamily,
        risks: draftRisks,
        warnings: draftWarnings,
        documents: draftDocuments,
        links: draftLinks,
      });
    } finally {
      setSaving(false);
    }
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
    return (
      <div className="compliance-view-stack">
        <div className="stats-row compliance-stat-grid compliance-stat-grid-large">
          <article className="stat-card compliance-dashboard-card blue">
            <span>Productfamilies</span>
            <strong>{totals.families}</strong>
          </article>
          <article className="stat-card compliance-dashboard-card green">
            <span>Gekoppelde producten</span>
            <strong>{totals.linkedProducts}</strong>
          </article>
          <article className="stat-card compliance-dashboard-card emerald">
            <span>Complete dossiers</span>
            <strong>{totals.complete}</strong>
          </article>
          <article className="stat-card compliance-dashboard-card red">
            <span>Producten zonder familie</span>
            <strong>{productsWithoutFamily.length}</strong>
          </article>
        </div>

        <div className="compliance-dashboard-grid">
          <section className="panel">
            <div className="panel-title">Incomplete dossiers</div>
            <div className="compliance-panel-body">
              {incompleteFamilies.length === 0 ? <p className="empty">Geen incomplete dossiers.</p> : incompleteFamilies.map(({ family, stats }) => (
                <button type="button" key={family.id} className="compliance-list-row" onClick={() => { setModuleView('families'); setSelectedFamilyId(family.id); }}>
                  <div>
                    <strong>{family.name}</strong>
                    <span>{stats.progress}% compleet</span>
                  </div>
                  <span className="compliance-inline-status warning">{stats.activeLinks === 0 ? 'Gekoppelde producten missen' : 'Aanvullen'}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Hoog risico families</div>
            <div className="compliance-panel-body">
              {highRiskFamilies.length === 0 ? <p className="empty">Geen hoog risico families.</p> : highRiskFamilies.map(({ family, stats }) => (
                <button type="button" key={family.id} className="compliance-list-row" onClick={() => { setModuleView('families'); setSelectedFamilyId(family.id); }}>
                  <div>
                    <strong>{family.name}</strong>
                    <span>{stats.activeLinks} gekoppelde producten</span>
                  </div>
                  <span className={`compliance-badge danger`}>{riskLabel(family.riskLevel)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Documenten bijna verlopen</div>
            <div className="compliance-panel-body">
              {expiringDocuments.length === 0 ? <p className="empty">Geen documenten verlopen binnen 60 dagen.</p> : expiringDocuments.map((document) => {
                const family = families.find((item) => item.id === document.familyId);
                return (
                  <button type="button" key={document.id} className="compliance-list-row" onClick={() => { setModuleView('documents'); setDocumentQuery(document.documentName); }}>
                    <div>
                      <strong>{document.documentName}</strong>
                      <span>{family?.name || 'Onbekende familie'}</span>
                    </div>
                    <span className="compliance-inline-status warning">{formatDate(document.validUntil)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Verlopen documenten</div>
            <div className="compliance-panel-body">
              {expiredDocuments.length === 0 ? <p className="empty">Geen verlopen documenten.</p> : expiredDocuments.map((document) => {
                const family = families.find((item) => item.id === document.familyId);
                return (
                  <button type="button" key={document.id} className="compliance-list-row" onClick={() => { setModuleView('documents'); setDocumentQuery(document.documentName); }}>
                    <div>
                      <strong>{document.documentName}</strong>
                      <span>{family?.name || 'Onbekende familie'}</span>
                    </div>
                    <span className="compliance-inline-status danger">{formatDate(document.validUntil)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderFamiliesView() {
    const selectedStats = draftFamily ? getComplianceFamilyStats(draftFamily, draftRisks, draftWarnings, draftDocuments, draftLinks) : null;

    return (
      <div className="compliance-layout">
        <section className="panel compliance-family-list">
          <div className="panel-title">
            <span className="panel-title-label">Productfamilies</span>
            <button type="button" className="primary-button" onClick={createNewFamily}><Plus size={14} /> Nieuwe familie</button>
          </div>
          <div className="compliance-family-toolbar">
            <div className="search-field">
              <Search size={16} />
              <input value={familyQuery} onChange={(event) => setFamilyQuery(event.target.value)} placeholder="Zoeken op naam of code..." />
            </div>
          </div>
          <div className="compliance-family-scroll compact">
            {filteredFamilies.map(({ family, stats }) => (
              <button
                type="button"
                key={family.id}
                className={`compliance-family-compact-item ${selectedFamilyId === family.id ? 'active' : ''}`}
                onClick={() => { setSelectedFamilyId(family.id); setDetailTab('basic'); }}
              >
                <div className="compliance-family-compact-top">
                  <strong>{family.code}</strong>
                  <span className={`compliance-status-pill ${stats.calculatedStatus}`}>{statusLabel(stats.calculatedStatus)}</span>
                </div>
                <div className="compliance-family-compact-name">{family.name}</div>
                <div className="compliance-family-compact-meta">
                  <span>{stats.activeLinks} producten</span>
                  <span>{stats.progress}% compleet</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel compliance-family-detail">
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
                              <option value="partial">Gedeeltelijk</option>
                              <option value="complete">Compleet</option>
                              <option value="not_applicable">Niet van toepassing</option>
                              <option value="archived">Archief</option>
                            </select>
                          </label>
                          <label className="checkbox-label">
                            <input type="checkbox" checked={draftFamily.gpsrRequired ?? true} onChange={(event) => setDraftFamily((current) => current ? { ...current, gpsrRequired: event.target.checked } : current)} />
                            <span>GPSR verplicht</span>
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

                {detailTab === 'documents' && (
                  <section className="panel">
                    <div className="panel-title">
                      <span>Documenten ({draftDocuments.length})</span>
                      <button type="button" className="secondary-button" onClick={addDocument}><Plus size={14} /> Document</button>
                    </div>
                    <div className="compliance-panel-body compliance-grid-table">
                      {draftDocuments.map((document, index) => (
                        <div className="compliance-document-row" key={document.id}>
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
                        <div className="search-field">
                          <Plus size={16} />
                          <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Koppel bestaand product" />
                        </div>
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
                          <span>Actie</span>
                        </div>
                        {pagedLinkedProducts.map(({ link, product }) => (
                          <div className="compliance-linked-products-row" key={link.id}>
                            <strong>{product?.code || '-'}</strong>
                            <span>{product?.description || link.variantDescription || '-'}</span>
                            <span>{product?.articleGroup || link.variantDescription || '-'}</span>
                            <div className="compliance-linked-product-actions">
                              {product ? <button type="button" className="secondary-button" onClick={() => onSelectProduct(product, 'gpsr')}>Open product</button> : null}
                              <button type="button" className="danger-button" onClick={() => deactivateLink(link.id)}>Ontkoppel</button>
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
              </div>
            </>
          )}
        </section>
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
      ppwrContractStatus: 'Niet gestart',
      ppwrDeclarationStatus: 'Ontbreekt',
    };
    setDraftPackagingSupplier(supplier);
    setSelectedPackagingSupplierKey(`draft-${supplier.id}`);
  }

  async function savePackagingSupplier() {
    if (!draftPackagingSupplier) return;
    setSaving(true);
    try {
      await onSavePackagingSupplier({
        ...draftPackagingSupplier,
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
        packagingMaterials: draftPackagingSupplier.packagingMaterials?.trim() || undefined,
        ppwrEprNumber: draftPackagingSupplier.ppwrEprNumber?.trim() || undefined,
        ppwrLastDeclarationAt: draftPackagingSupplier.ppwrLastDeclarationAt?.trim() || undefined,
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

  function renderPackagingSuppliersView() {
    const selectedUsage = packagingSupplierRows.find((row) => row.key === selectedPackagingSupplierKey)?.usage;

    return (
      <div className="compliance-layout">
        <section className="panel compliance-family-list">
          <div className="panel-title">
            <span className="panel-title-label">PPWR leveranciers</span>
            <button type="button" className="primary-button" onClick={createPackagingSupplierDraft}>
              <Plus size={14} /> Nieuwe kaart
            </button>
          </div>
          <div className="compliance-panel-body compliance-view-stack">
            <section className="stat-grid packaging-supplier-stat-grid">
              <div className="stat-card"><ShieldCheck size={18} /><div><span>Kaarten</span><strong>{packagingSupplierTotals.total}</strong></div></div>
              <div className="stat-card"><CheckCircle2 size={18} /><div><span>PPWR gereed</span><strong>{packagingSupplierTotals.ready}</strong></div></div>
              <div className="stat-card"><AlertTriangle size={18} /><div><span>Ontbrekend</span><strong>{packagingSupplierTotals.missing}</strong></div></div>
            </section>
            <div className="search-field">
              <Search size={16} />
              <input value={supplierQuery} onChange={(event) => setSupplierQuery(event.target.value)} placeholder="Zoeken op leverancier of materiaal..." />
            </div>
            <div className="compliance-family-scroll compact">
              {packagingSupplierRows.map((row) => (
                <button
                  type="button"
                  key={row.key}
                  className={`compliance-family-compact-item ${selectedPackagingSupplierKey === row.key ? 'active' : ''}`}
                  onClick={() => setSelectedPackagingSupplierKey(row.key)}
                >
                  <div className="compliance-family-compact-top">
                    <strong>{row.supplier?.name || row.usage?.name || 'Naam ontbreekt'}</strong>
                    <span className={`compliance-status-pill ${row.isReady ? 'complete' : row.supplier ? 'partial' : 'concept'}`}>
                      {row.isReady ? 'PPWR gereed' : row.supplier ? 'Aanvullen' : 'Nog aanmaken'}
                    </span>
                  </div>
                  <div className="compliance-family-compact-name">{row.supplier?.packagingMaterials || Array.from(row.usage?.materials ?? []).join(', ') || 'Nog geen materiaalprofiel'}</div>
                  <div className="compliance-family-compact-meta">
                    <span>{row.usage?.products.length ?? 0} producten</span>
                    <span>{row.usage?.layers ?? 0} lagen</span>
                  </div>
                </button>
              ))}
              {packagingSupplierRows.length === 0 ? <p className="empty compliance-empty">Nog geen verpakkingsleveranciers gevonden.</p> : null}
            </div>
          </div>
        </section>

        <section className="panel compliance-family-detail">
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
                  <button type="button" className="secondary-button" onClick={() => setDraftPackagingSupplier((current) => current ? { ...current, active: current.active === false } : current)}>
                    {draftPackagingSupplier.active === false ? 'Zet actief' : 'Zet niet actief'}
                  </button>
                  <button type="button" className="primary-button" onClick={() => void savePackagingSupplier()} disabled={saving || !draftPackagingSupplier.name.trim()}>
                    Opslaan
                  </button>
                </div>
              </div>

              <div className="compliance-panel-body compliance-view-stack">
                <section className="panel packaging-supplier-summary-panel">
                  <div className="panel-title">PPWR status</div>
                  <div className="packaging-supplier-summary-grid">
                    <div className={`packaging-supplier-summary-card ${packagingSupplierProfileReady(draftPackagingSupplier) ? 'is-ready' : 'is-warning'}`}>
                      <span>Profiel</span>
                      <strong>{packagingSupplierProfileReady(draftPackagingSupplier) ? 'Gereed' : 'Aanvullen'}</strong>
                      <small>Contract, aangifte en materiaalprofiel moeten gevuld zijn.</small>
                    </div>
                    <div className="packaging-supplier-summary-card">
                      <span>Contract</span>
                      <strong>{packagingSupplierContractLabel(draftPackagingSupplier.ppwrContractStatus)}</strong>
                      <small>{draftPackagingSupplier.ppwrSupplierRole || 'Rol nog niet gekozen'}</small>
                    </div>
                    <div className="packaging-supplier-summary-card">
                      <span>Aangifte</span>
                      <strong>{packagingSupplierDeclarationLabel(draftPackagingSupplier.ppwrDeclarationStatus)}</strong>
                      <small>{draftPackagingSupplier.ppwrLastDeclarationAt ? `Laatste update ${formatDate(draftPackagingSupplier.ppwrLastDeclarationAt)}` : 'Nog geen datum vastgelegd'}</small>
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-title">Leverancierskaart</div>
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
                      <span>Land</span>
                      <input value={draftPackagingSupplier.country || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, country: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Materialen / scope</span>
                      <input value={draftPackagingSupplier.packagingMaterials || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, packagingMaterials: event.target.value } : current)} placeholder="Bijv. PAP 20, PE-LD 04, labels" />
                    </label>
                    <label>
                      <span>PPWR rol</span>
                      <select value={draftPackagingSupplier.ppwrSupplierRole || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrSupplierRole: (event.target.value || undefined) as Supplier['ppwrSupplierRole'] } : current)}>
                        <option value="">Selecteer...</option>
                        <option value="Producent">Producent</option>
                        <option value="Converter">Converter</option>
                        <option value="Handelaar">Handelaar</option>
                        <option value="Co-packer">Co-packer</option>
                      </select>
                    </label>
                    <label>
                      <span>Verantwoordelijkheid</span>
                      <select value={draftPackagingSupplier.ppwrResponsibility || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrResponsibility: (event.target.value || undefined) as Supplier['ppwrResponsibility'] } : current)}>
                        <option value="">Selecteer...</option>
                        <option value="Primair">Primair</option>
                        <option value="Secundair">Secundair</option>
                        <option value="Tertiair">Tertiair</option>
                        <option value="Combinatie">Combinatie</option>
                      </select>
                    </label>
                    <label>
                      <span>Contractstatus</span>
                      <select value={draftPackagingSupplier.ppwrContractStatus || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrContractStatus: (event.target.value || undefined) as Supplier['ppwrContractStatus'] } : current)}>
                        <option value="">Selecteer...</option>
                        <option value="Niet gestart">Niet gestart</option>
                        <option value="In aanvraag">In aanvraag</option>
                        <option value="Actief">Actief</option>
                        <option value="Geblokkeerd">Geblokkeerd</option>
                        <option value="Verlopen">Verlopen</option>
                      </select>
                    </label>
                    <label>
                      <span>Aangiftestatus</span>
                      <select value={draftPackagingSupplier.ppwrDeclarationStatus || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrDeclarationStatus: (event.target.value || undefined) as Supplier['ppwrDeclarationStatus'] } : current)}>
                        <option value="">Selecteer...</option>
                        <option value="Ontbreekt">Ontbreekt</option>
                        <option value="Aangevraagd">Aangevraagd</option>
                        <option value="Ontvangen">Ontvangen</option>
                        <option value="Goedgekeurd">Goedgekeurd</option>
                      </select>
                    </label>
                    <label>
                      <span>EPR / registratienummer</span>
                      <input value={draftPackagingSupplier.ppwrEprNumber || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrEprNumber: event.target.value } : current)} />
                    </label>
                    <label>
                      <span>Laatste PPWR update</span>
                      <input type="date" value={draftPackagingSupplier.ppwrLastDeclarationAt || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrLastDeclarationAt: event.target.value } : current)} />
                    </label>
                    <label className="compliance-checkbox-label">
                      <input type="checkbox" checked={draftPackagingSupplier.isPackagingSupplier !== false} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, isPackagingSupplier: event.target.checked } : current)} />
                      <span>Actieve verpakkingsleverancier</span>
                    </label>
                    <label className="compliance-checkbox-label">
                      <input type="checkbox" checked={draftPackagingSupplier.active !== false} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, active: event.target.checked } : current)} />
                      <span>Actief record</span>
                    </label>
                    <label className="span-2">
                      <span>PPWR notities</span>
                      <textarea value={draftPackagingSupplier.ppwrNotes || ''} onChange={(event) => setDraftPackagingSupplier((current) => current ? { ...current, ppwrNotes: event.target.value } : current)} />
                    </label>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-title">Gekoppelde producten</div>
                  <div className="compliance-linked-products-table">
                    <div className="compliance-linked-products-header">
                      <span>Artikelnummer</span>
                      <span>Omschrijving</span>
                      <span>Materialen</span>
                      <span>PPWR</span>
                    </div>
                    {(selectedUsage?.products ?? []).map((product) => (
                      <button key={product.id} type="button" className="compliance-linked-products-row compliance-linked-products-button" onClick={() => onSelectProduct(product, 'gpsr')}>
                        <strong>{product.code || '-'}</strong>
                        <span>{product.description || '-'}</span>
                        <span>{Array.from(selectedUsage?.materials ?? []).join(', ') || '-'}</span>
                        <span>{product.packagingWeightTotalGrams || product.packagingWeightPrimaryGrams || '-'}</span>
                      </button>
                    ))}
                    {(selectedUsage?.products.length ?? 0) === 0 ? <p className="empty">Nog geen producten gekoppeld aan deze leverancier.</p> : null}
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="compliance-module-shell">
      <div className="page-title-row">
        <div>
          <h1>Compliance</h1>
          <span>GPSR Compliance-module op basis van je bestaande producten en koppelingen.</span>
        </div>
      </div>

      {message ? <div className="inline-notice success-notice">{message}</div> : null}

      <div className="compliance-module-nav">
        {moduleViews.map((view) => {
          const Icon = view.icon;
          return (
            <button
              type="button"
              key={view.id}
              className={moduleView === view.id ? 'active' : ''}
              onClick={() => setModuleView(view.id)}
            >
              <Icon size={15} />
              <span>{view.label}</span>
            </button>
          );
        })}
      </div>

      {moduleView === 'dashboard' && renderDashboard()}
      {moduleView === 'families' && renderFamiliesView()}
      {moduleView === 'unlinked' && renderUnlinkedProductsView()}
      {moduleView === 'documents' && renderDocumentsView()}
      {moduleView === 'templates' && renderTemplatesView()}
      {moduleView === 'packagingSuppliers' && renderPackagingSuppliersView()}
    </div>
  );
}
