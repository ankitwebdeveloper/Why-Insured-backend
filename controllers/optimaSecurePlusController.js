import db from '../database/db.js';

const SECTION_CONFIGS = [
  {
    id: 'sec-1',
    sectionKey: 'most_important',
    title: 'MOST IMPORTANT FEATURES',
    subtitle: 'Essential hospitalisation coverage offered under Optima Secure+',
    gridCols: 'grid-cols-2 lg:grid-cols-3'
  },
  {
    id: 'sec-2',
    sectionKey: 'value_added',
    title: 'VALUE ADDED FEATURES',
    subtitle: 'Unique value-added benefits and multipliers',
    gridCols: 'grid-cols-2 lg:grid-cols-3'
  },
  {
    id: 'sec-3',
    sectionKey: 'additional',
    title: 'ADDITIONAL FEATURES',
    subtitle: 'Daily allowances, ambulance, and specialized treatments',
    gridCols: 'grid-cols-2 lg:grid-cols-3'
  },
  {
    id: 'sec-4',
    sectionKey: 'optional_rider',
    title: 'OPTIONAL RIDERS (ADD-ONS)',
    subtitle: 'Customizable add-ons to enhance your protection',
    gridCols: 'grid-cols-2 lg:grid-cols-3'
  }
];

// Helper to format Report Card for frontend
function formatReportCard(items) {
  const findByTitleOrId = (titleMatch, idMatch) => {
    return items.find((i) =>
      (i.id && String(i.id).toLowerCase().includes(idMatch.toLowerCase())) ||
      (i.title && String(i.title).toLowerCase().includes(titleMatch.toLowerCase()))
    );
  };

  const csrItem = findByTitleOrId('csr', 'csr') || {};
  const icrItem = findByTitleOrId('icr', 'icr') || {};
  const complaintItem = findByTitleOrId('complaint', 'complaint') || {};

  return {
    heading: 'REPORT CARD',
    subheading: 'HDFC ERGO Performance',
    description: 'Official claim settlement and financial strength metrics.',
    items,
    csr: {
      title: csrItem.title || 'CSR',
      summaryValue: csrItem.score || csrItem.summaryValue || csrItem.summary_value || '97.8%',
      subtitle: csrItem.subtitle || 'Claim Settlement Ratio',
      explanation: csrItem.description || csrItem.explanation || 'CSR shows the percentage of eligible claims settled.',
      singleYear: csrItem.single_year || csrItem.singleYear || '97.45% → 97.8%',
      singleYearLabel: csrItem.single_year_label || csrItem.singleYearLabel || 'Recent Single Year',
      threeYearAvg: csrItem.three_year_avg || csrItem.threeYearAvg || '96.7% → 97.6%',
      threeYearAvgLabel: csrItem.three_year_avg_label || csrItem.threeYearAvgLabel || '3 Year Average',
      videoTitle: csrItem.video_title || csrItem.videoTitle || 'CSR Metrics',
      videoUrl: csrItem.video_url || csrItem.videoUrl || 'asset:preventive'
    },
    icr: {
      title: icrItem.title || 'ICR',
      summaryValue: icrItem.score || icrItem.summaryValue || icrItem.summary_value || '86%',
      subtitle: icrItem.subtitle || 'Incurred Claim Ratio',
      explanation: icrItem.description || icrItem.explanation || "ICR indicates the proportion of premium spent on claims.",
      range: icrItem.range || '81% → 86%',
      rangeLabel: icrItem.range_label || icrItem.rangeLabel || 'Incurred Claim Ratio',
      videoTitle: icrItem.video_title || icrItem.videoTitle || 'ICR Metrics',
      videoUrl: icrItem.video_url || icrItem.videoUrl || 'asset:preventive'
    },
    complaintVolume: {
      title: complaintItem.title || 'COMPLAINT VOLUME',
      summaryValue: complaintItem.score || complaintItem.summaryValue || complaintItem.summary_value || '9.28',
      explanation: complaintItem.description || complaintItem.explanation || 'Complaint volume indicates complaints received per 10,000 claims.',
      value: complaintItem.value || '4.99 → 9.28',
      label: complaintItem.label || 'Complaints per 10,000 Claims',
      videoTitle: complaintItem.video_title || complaintItem.videoTitle || 'Complaint Volume Metrics',
      videoUrl: complaintItem.video_url || complaintItem.videoUrl || 'asset:preventive'
    }
  };
}

// Helper to format Company Strength for frontend
function formatCompanyStrength(items) {
  const findByTitleOrId = (titleMatch, idMatch) => {
    return items.find((i) =>
      (i.id && String(i.id).toLowerCase().includes(idMatch.toLowerCase())) ||
      (i.title && String(i.title).toLowerCase().includes(titleMatch.toLowerCase()))
    );
  };

  const ownershipItem = findByTitleOrId('ownership', 'ownership') || {};
  const creditItem = findByTitleOrId('credit', 'credit') || {};
  const capitalItem = findByTitleOrId('capital', 'capital') || {};
  const financialItem = findByTitleOrId('financial', 'financial') || {};
  const reinsuranceItem = findByTitleOrId('reinsurance', 'reinsurance') || {};
  const marketItem = findByTitleOrId('market', 'market') || {};

  return {
    heading: 'COMPANY STRENGTH',
    subheading: 'How reliable/strong is the insurer?',
    description: 'How reliable/strong is the insurer?',
    items,
    ownership: {
      title: ownershipItem.title || 'OWNERSHIP / PERCENTAGE',
      summaryValue: ownershipItem.value || ownershipItem.summaryValue || ownershipItem.summary_value || '51% / 49%',
      explanation: ownershipItem.description || ownershipItem.explanation || 'Ownership represents shareholding structure.',
      items: ownershipItem.items || [
        { name: 'HDFC Bank', value: '51%', label: 'Ownership' },
        { name: 'ERGO International AG', value: '49%', label: 'Ownership' }
      ],
      videoTitle: ownershipItem.video_title || ownershipItem.videoTitle || 'Ownership & Shareholding',
      videoUrl: ownershipItem.video_url || ownershipItem.videoUrl || 'asset:2x_coverage'
    },
    creditRating: {
      title: creditItem.title || 'CREDIT RATING',
      summaryValue: creditItem.value || creditItem.summaryValue || creditItem.summary_value || 'AAA',
      explanation: creditItem.description || creditItem.explanation || 'Credit ratings indicate financial strength.',
      items: creditItem.items || [
        { agency: 'CRISIL', rating: 'AAA / Stable' },
        { agency: 'ICRA', rating: 'AAA / Stable' }
      ],
      videoTitle: creditItem.video_title || creditItem.videoTitle || 'Credit Ratings & Financial Strength',
      videoUrl: creditItem.video_url || creditItem.videoUrl || 'asset:2x_coverage'
    },
    capitalStrength: {
      title: capitalItem.title || 'CAPITAL STRENGTH',
      summaryValue: capitalItem.value || capitalItem.summaryValue || capitalItem.summary_value || '2.00×',
      explanation: capitalItem.description || capitalItem.explanation || 'Solvency indicates financial capacity.',
      value: capitalItem.value || '2.00×',
      label: capitalItem.label || 'Solvency (as of March 2025)',
      videoTitle: capitalItem.video_title || capitalItem.videoTitle || 'Capital Strength & Solvency',
      videoUrl: capitalItem.video_url || capitalItem.videoUrl || 'asset:unlimited'
    },
    financialBase: {
      title: financialItem.title || 'FINANCIAL BASE',
      summaryValue: financialItem.value || financialItem.summaryValue || financialItem.summary_value || '₹27,373 Cr',
      explanation: financialItem.description || financialItem.explanation || 'Investment assets supporting operations.',
      value: financialItem.value || '₹27,373 Cr',
      label: financialItem.label || 'Investment assets (as of March 2025)',
      videoTitle: financialItem.video_title || financialItem.videoTitle || 'Financial Base & Investments',
      videoUrl: financialItem.video_url || financialItem.videoUrl || 'asset:unlimited'
    },
    reinsuranceStrength: {
      title: reinsuranceItem.title || 'REINSURANCE STRENGTH',
      summaryValue: reinsuranceItem.value || reinsuranceItem.summaryValue || reinsuranceItem.summary_value || '85%+',
      explanation: reinsuranceItem.description || reinsuranceItem.explanation || 'Reinsurance risk-management capacity.',
      value: reinsuranceItem.value || '85%+',
      label: reinsuranceItem.label || 'Placed with A+ or higher-rated reinsurers',
      videoTitle: reinsuranceItem.video_title || reinsuranceItem.videoTitle || 'Reinsurance Strength',
      videoUrl: reinsuranceItem.video_url || reinsuranceItem.videoUrl || 'asset:preventive'
    },
    marketPosition: {
      title: marketItem.title || 'MARKET POSITION',
      summaryValue: marketItem.value || marketItem.summaryValue || marketItem.summary_value || '5.3%',
      explanation: marketItem.description || marketItem.explanation || 'GDPI market share in general insurance.',
      value: marketItem.value || '5.3%',
      label: marketItem.label || 'GDPI market share (FY2025)',
      videoTitle: marketItem.video_title || marketItem.videoTitle || 'Market Position & Share',
      videoUrl: marketItem.video_url || marketItem.videoUrl || 'asset:preventive'
    }
  };
}

// Helper to format Limitations for frontend
function formatLimitations(items) {
  return {
    heading: 'LIMITATIONS & WAITING PERIODS',
    subheading: 'Terms & Waiting Periods',
    description: 'Interactive policy timelines, specific disease waiting, and permanent exclusions.',
    items: items.map((i) => ({
      id: i.id, // EXACT database ID preserved
      keyId: String(i.id).replace('lim-', ''), // Clean key for accordion toggle
      title: i.title,
      summary: i.summary || i.description || '',
      description: i.description || i.summary || '',
      highlight: i.highlight || '',
      highlightType: i.highlight_type || i.highlightType || 'success',
      policyRef: i.policy_ref || i.policyRef || '',
      durationTag: i.duration_tag || i.durationTag || '',
      diseaseListHeader: i.disease_list_header || i.diseaseListHeader || '',
      diseaseList: i.disease_list || i.diseaseList || null,
      exclusionsListHeader: i.exclusions_list_header || i.exclusionsListHeader || '',
      exclusionsList: i.exclusions_list || i.exclusionsList || null,
      videoTitle: i.video_title || i.videoTitle || i.title,
      videoUrl: i.video_url || i.videoUrl || 'asset:preventive',
      status: i.status
    }))
  };
}

// Helper to format Must Know for frontend
function formatMustKnow(items) {
  return {
    heading: 'MUST-KNOW DETAILS',
    subheading: 'things a customer could easily miss or misunderstand',
    buttonLabel: 'MUST KNOW DETAILS',
    layout: 'details-modal',
    items: items.map((i) => ({
      id: i.id, // EXACT database ID preserved
      keyId: String(i.id).replace('mk-', ''),
      icon: i.icon || 'ℹ️',
      title: i.title,
      description: i.description || '',
      paragraphs: i.paragraphs || [i.description || ''],
      status: i.status
    }))
  };
}

// =============================================================================
// MAIN PUBLIC PLAN DATA AGGREGATOR
// =============================================================================
export const getPlanData = (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const plan = db.plans.findById('hdfc-optima-secure-plus') || {
      id: 'hdfc-optima-secure-plus',
      company_name: 'HDFC ERGO',
      plan_name: 'Optima Secure+',
      tagline: 'Unlimited Protection. Added Every Year.',
      policy_subtitle: 'HDFC ERGO Health Insurance Policy',
      description: '4X Coverage with Secure, Plus, Restore & Protect benefits and unlimited restoration.',
      logo: '/assets/hdfc-ergo.png',
      coverage: '₹10 Lakh - ₹2 Crore',
      status: 'active'
    };

    const allFeatures = db.planFeatures.findByPlanId('hdfc-optima-secure-plus', {
      includeInactive
    });

    const reportCardItems = db.reportCard.findByPlanId('hdfc-optima-secure-plus', {
      includeInactive
    });

    const companyStrengthItems = db.companyStrength.findByPlanId('hdfc-optima-secure-plus', {
      includeInactive
    });

    const limitationsItems = db.limitations.findByPlanId('hdfc-optima-secure-plus', {
      includeInactive
    });

    const mustKnowItems = db.mustKnow.findByPlanId('hdfc-optima-secure-plus', {
      includeInactive
    });

    // Format into featuresSections structure expected by frontend
    const featuresSections = SECTION_CONFIGS.map((cfg) => {
      const items = allFeatures
        .filter((f) => f.section === cfg.sectionKey)
        .map((f) => ({
          id: f.id,
          title: f.title,
          subtitle: f.subtitle || '',
          summary: f.summary || '',
          detailed_description: f.detailed_description || '',
          intro: f.intro || '',
          points: f.points || null,
          steps: f.steps || null,
          badge: f.badge || '',
          iconType: f.icon_type || 'check',
          videoTitle: f.video_title || f.title,
          videoUrl: f.video_url || '',
          isRider: cfg.sectionKey === 'optional_rider',
          hasHealthCheckupTable: Boolean(f.has_health_checkup_table),
          healthCheckupLimits: f.health_checkup_limits || null,
          tableButtonLabel: f.table_button_label || '',
          displayOrder: f.display_order,
          status: f.status
        }));

      return {
        id: cfg.id,
        sectionKey: cfg.sectionKey,
        title: cfg.title,
        subtitle: cfg.subtitle,
        gridCols: cfg.gridCols,
        items
      };
    });

    return res.json({
      success: true,
      data: {
        planId: plan.id,
        planName: plan.plan_name,
        companyName: plan.company_name,
        policySubtitle: plan.policy_subtitle,
        tagline: plan.tagline,
        description: plan.description,
        logo: plan.logo,
        coverage: plan.coverage,
        status: plan.status,
        featuresSections,
        allFeatures,
        reportCard: formatReportCard(reportCardItems),
        companyStrength: formatCompanyStrength(companyStrengthItems),
        limitationsWaitingPeriods: formatLimitations(limitationsItems),
        mustKnow: formatMustKnow(mustKnowItems)
      }
    });
  } catch (error) {
    console.error('Error fetching Optima Secure+ plan data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch plan data'
    });
  }
};

export const updatePlanInfo = (req, res) => {
  try {
    const { plan_name, company_name, policy_subtitle, tagline, description, logo, coverage, status } = req.body;
    const updated = db.plans.upsert({
      id: 'hdfc-optima-secure-plus',
      plan_name,
      company_name,
      policy_subtitle,
      tagline,
      description,
      logo,
      coverage,
      status
    });

    return res.json({
      success: true,
      message: 'Plan information updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating plan info:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update plan information'
    });
  }
};

// =============================================================================
// FEATURES CRUD
// =============================================================================
export const getFeatures = (req, res) => {
  try {
    const { section, includeInactive } = req.query;
    const features = db.planFeatures.findByPlanId('hdfc-optima-secure-plus', {
      section,
      includeInactive: includeInactive === 'true'
    });
    return res.json({ success: true, count: features.length, data: features });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch features' });
  }
};

export const getFeatureById = (req, res) => {
  try {
    const feature = db.planFeatures.findById(req.params.id);
    if (!feature) return res.status(404).json({ success: false, error: 'Feature not found' });
    return res.json({ success: true, data: feature });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch feature' });
  }
};

export const createFeature = (req, res) => {
  try {
    const { section, title, subtitle, summary, detailed_description, intro, points, steps, badge, icon_type, video_title, video_url, display_order, status } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'Feature title is required' });
    }

    const newFeature = db.planFeatures.create({
      plan_id: 'hdfc-optima-secure-plus',
      section: section || 'most_important',
      title: String(title).trim(),
      subtitle: subtitle || '',
      summary: summary || '',
      detailed_description: detailed_description || '',
      intro: intro || '',
      points: Array.isArray(points) ? points : null,
      steps: Array.isArray(steps) ? steps : null,
      badge: badge || '',
      icon_type: icon_type || 'check',
      video_title: video_title || String(title).trim(),
      video_url: video_url || '',
      display_order: (display_order !== undefined && display_order !== null && !isNaN(Number(display_order))) ? Number(display_order) : undefined,
      status: status || 'active'
    });

    return res.status(201).json({ success: true, message: 'Feature created successfully', data: newFeature });
  } catch (error) {
    console.error('Error creating feature:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create feature' });
  }
};

export const updateFeature = (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.planFeatures.findById(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Feature not found' });

    const updated = db.planFeatures.update(id, req.body);
    return res.json({ success: true, message: 'Feature updated successfully', data: updated });
  } catch (error) {
    console.error('Error updating feature:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update feature' });
  }
};

export const deleteFeature = (req, res) => {
  try {
    const { id } = req.params;
    const deleted = db.planFeatures.delete(id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Feature not found' });
    return res.json({ success: true, message: 'Feature deleted successfully' });
  } catch (error) {
    console.error('Error deleting feature:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete feature' });
  }
};

export const toggleFeatureStatus = (req, res) => {
  try {
    const { id } = req.params;
    const updated = db.planFeatures.toggleStatus(id);
    if (!updated) return res.status(404).json({ success: false, error: 'Feature not found' });
    return res.json({ success: true, message: `Feature status updated to ${updated.status}`, data: updated });
  } catch (error) {
    console.error('Error toggling feature status:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to toggle feature status' });
  }
};

export const reorderFeatures = (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ success: false, error: 'Items array is required' });
    db.planFeatures.reorder(items);
    return res.json({ success: true, message: 'Features reordered successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to reorder features' });
  }
};

// =============================================================================
// GENERIC SECTION CRUD GENERATOR (REPORT CARD, COMPANY STRENGTH, LIMITATIONS, MUST KNOW)
// =============================================================================
function createSectionHandlers(collectionName, entityLabel) {
  const handler = db[collectionName];
  return {
    getAll: (req, res) => {
      try {
        const includeInactive = req.query.includeInactive === 'true';
        const items = handler.findByPlanId('hdfc-optima-secure-plus', { includeInactive });
        return res.json({ success: true, count: items.length, data: items });
      } catch (error) {
        return res.status(500).json({ success: false, error: `Failed to fetch ${entityLabel} items` });
      }
    },
    getById: (req, res) => {
      try {
        const item = handler.findById(req.params.id);
        if (!item) return res.status(404).json({ success: false, error: `${entityLabel} item not found` });
        return res.json({ success: true, data: item });
      } catch (error) {
        return res.status(500).json({ success: false, error: `Failed to fetch ${entityLabel} item` });
      }
    },
    create: (req, res) => {
      try {
        if (!req.body.title || !String(req.body.title).trim()) {
          return res.status(400).json({ success: false, error: 'Title is required' });
        }
        const created = handler.create({
          plan_id: 'hdfc-optima-secure-plus',
          ...req.body,
          title: String(req.body.title).trim()
        });
        return res.status(201).json({ success: true, message: `${entityLabel} created successfully`, data: created });
      } catch (error) {
        console.error(`Error creating ${entityLabel}:`, error);
        return res.status(500).json({ success: false, error: error.message || `Failed to create ${entityLabel}` });
      }
    },
    update: (req, res) => {
      try {
        const updated = handler.update(req.params.id, req.body);
        if (!updated) return res.status(404).json({ success: false, error: `${entityLabel} not found` });
        return res.json({ success: true, message: `${entityLabel} updated successfully`, data: updated });
      } catch (error) {
        console.error(`Error updating ${entityLabel}:`, error);
        return res.status(500).json({ success: false, error: error.message || `Failed to update ${entityLabel}` });
      }
    },
    delete: (req, res) => {
      try {
        const deleted = handler.delete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: `${entityLabel} not found` });
        return res.json({ success: true, message: `${entityLabel} deleted successfully` });
      } catch (error) {
        console.error(`Error deleting ${entityLabel}:`, error);
        return res.status(500).json({ success: false, error: error.message || `Failed to delete ${entityLabel}` });
      }
    },
    toggleStatus: (req, res) => {
      try {
        const updated = handler.toggleStatus(req.params.id);
        if (!updated) return res.status(404).json({ success: false, error: `${entityLabel} not found` });
        return res.json({ success: true, message: `${entityLabel} status updated to ${updated.status}`, data: updated });
      } catch (error) {
        console.error(`Error toggling ${entityLabel} status:`, error);
        return res.status(500).json({ success: false, error: error.message || `Failed to toggle ${entityLabel} status` });
      }
    },
    reorder: (req, res) => {
      try {
        const { items } = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ success: false, error: 'Items array is required' });
        handler.reorder(items);
        return res.json({ success: true, message: `${entityLabel} reordered successfully` });
      } catch (error) {
        return res.status(500).json({ success: false, error: `Failed to reorder ${entityLabel}` });
      }
    }
  };
}

// Handlers for the 4 new sections
export const reportCardController = createSectionHandlers('reportCard', 'Report Card');
export const companyStrengthController = createSectionHandlers('companyStrength', 'Company Strength');
export const limitationsController = createSectionHandlers('limitations', 'Limitations');
export const mustKnowController = createSectionHandlers('mustKnow', 'Must Know');

// Video upload handler
export const uploadVideo = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No video file provided'
      });
    }

    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || Boolean(process.env.VERCEL);
    if (isVercel) {
      return res.status(501).json({
        success: false,
        error: 'Local filesystem video upload is not supported in Vercel serverless environment. Please use cloud storage or an embed URL (e.g., YouTube/Vimeo).'
      });
    }

    const videoPath = `/uploads/videos/${req.file.filename}`;
    return res.json({
      success: true,
      message: 'Video uploaded successfully',
      data: {
        filename: req.file.filename,
        url: videoPath,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload video file'
    });
  }
};
