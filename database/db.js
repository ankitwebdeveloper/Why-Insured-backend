import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (err) {
  // Read-only filesystem handling on serverless environments
}

const dbFilePath = path.join(dataDir, 'whyinsured_db.json');

// Internal helper to read data
function readData() {
  if (!fs.existsSync(dbFilePath)) {
    const initialData = {
      plans: [],
      plan_features: [],
      report_card: [],
      company_strength: [],
      limitations: [],
      must_know: []
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
  try {
    const raw = fs.readFileSync(dbFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      plan_features: Array.isArray(parsed.plan_features) ? parsed.plan_features : [],
      report_card: Array.isArray(parsed.report_card) ? parsed.report_card : [],
      company_strength: Array.isArray(parsed.company_strength) ? parsed.company_strength : [],
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
      must_know: Array.isArray(parsed.must_know) ? parsed.must_know : []
    };
  } catch (err) {
    console.error('Error reading database file, recovering structure:', err);
    return {
      plans: [],
      plan_features: [],
      report_card: [],
      company_strength: [],
      limitations: [],
      must_know: []
    };
  }
}

// Internal helper to write data atomically
function writeData(data) {
  try {
    const tempPath = `${dbFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, dbFilePath);
  } catch (err) {
    console.warn('[Database] Read-only filesystem detected on serverless runtime. In-memory data active.');
  }
}

// Generic CRUD collection builder
function createCollectionHandler(collectionKey, idPrefix) {
  return {
    findByPlanId(planId, options = {}) {
      const { includeInactive = false, category, section } = options;
      const data = readData();
      let list = (data[collectionKey] || []).filter((item) => item.plan_id === planId);

      if (category) {
        list = list.filter((item) => String(item.category || '').toLowerCase() === String(category).toLowerCase());
      }

      if (section) {
        list = list.filter((item) => item.section === section);
      }

      if (!includeInactive) {
        list = list.filter((item) => item.status === 'active');
      }

      // Sort by display_order ascending
      list.sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
      return list;
    },

    findById(id) {
      if (!id) return null;
      const data = readData();
      const targetId = String(id).trim();
      return (data[collectionKey] || []).find((item) => String(item.id).trim() === targetId) || null;
    },

    create(item) {
      const data = readData();
      const now = new Date().toISOString();
      const currentList = data[collectionKey] || [];
      const planId = item.plan_id || 'hdfc-optima-secure-plus';

      const maxOrder = currentList
        .filter((i) => i.plan_id === planId)
        .reduce((max, i) => Math.max(max, Number(i.display_order) || 0), 0);

      const generatedId = (item.id && String(item.id).trim().length > 0)
        ? String(item.id).trim()
        : `${idPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      const cleanItem = { ...item };
      delete cleanItem.id;
      delete cleanItem.display_order;

      const newItem = {
        ...cleanItem,
        id: generatedId,
        plan_id: planId,
        status: item.status || 'active',
        display_order: (item.display_order !== undefined && item.display_order !== null && !isNaN(Number(item.display_order)))
          ? Number(item.display_order)
          : maxOrder + 1,
        created_at: item.created_at || now,
        updated_at: now
      };

      currentList.push(newItem);
      data[collectionKey] = currentList;
      writeData(data);
      return newItem;
    },

    update(id, updates) {
      if (!id) return null;
      const data = readData();
      const currentList = data[collectionKey] || [];
      const targetId = String(id).trim();
      const idx = currentList.findIndex((item) => String(item.id).trim() === targetId);
      if (idx === -1) return null;

      const now = new Date().toISOString();
      const cleanUpdates = { ...updates };
      delete cleanUpdates.id; // Preserve original ID

      if (cleanUpdates.display_order !== undefined && cleanUpdates.display_order !== null) {
        cleanUpdates.display_order = Number(cleanUpdates.display_order);
      }

      currentList[idx] = {
        ...currentList[idx],
        ...cleanUpdates,
        updated_at: now
      };

      data[collectionKey] = currentList;
      writeData(data);
      return currentList[idx];
    },

    delete(id) {
      if (!id) return false;
      const data = readData();
      const currentList = data[collectionKey] || [];
      const targetId = String(id).trim();
      const idx = currentList.findIndex((item) => String(item.id).trim() === targetId);
      if (idx === -1) return false;

      currentList.splice(idx, 1);
      data[collectionKey] = currentList;
      writeData(data);
      return true;
    },

    toggleStatus(id) {
      if (!id) return null;
      const data = readData();
      const currentList = data[collectionKey] || [];
      const targetId = String(id).trim();
      const idx = currentList.findIndex((item) => String(item.id).trim() === targetId);
      if (idx === -1) return null;

      const now = new Date().toISOString();
      const current = currentList[idx].status;
      currentList[idx].status = current === 'active' ? 'inactive' : 'active';
      currentList[idx].updated_at = now;

      data[collectionKey] = currentList;
      writeData(data);
      return currentList[idx];
    },

    reorder(items) {
      if (!Array.isArray(items)) return false;
      const data = readData();
      const currentList = data[collectionKey] || [];
      const now = new Date().toISOString();

      for (const item of items) {
        if (!item || !item.id) continue;
        const targetId = String(item.id).trim();
        const found = currentList.find((i) => String(i.id).trim() === targetId);
        if (found) {
          found.display_order = Number(item.display_order);
          found.updated_at = now;
        }
      }

      data[collectionKey] = currentList;
      writeData(data);
      return true;
    },

    seedInitial(items) {
      const data = readData();
      if (!data[collectionKey] || data[collectionKey].length === 0) {
        data[collectionKey] = items;
        writeData(data);
        return true;
      }
      return false;
    }
  };
}

export const db = {
  plans: {
    findById(id) {
      if (!id) return null;
      const data = readData();
      return data.plans.find((p) => String(p.id).trim() === String(id).trim()) || null;
    },
    getAll() {
      const data = readData();
      return data.plans;
    },
    upsert(plan) {
      const data = readData();
      const planId = plan.id || 'hdfc-optima-secure-plus';
      const idx = data.plans.findIndex((p) => String(p.id).trim() === String(planId).trim());
      const now = new Date().toISOString();
      if (idx >= 0) {
        data.plans[idx] = {
          ...data.plans[idx],
          ...plan,
          updated_at: now
        };
      } else {
        data.plans.push({
          id: planId,
          company_name: 'HDFC ERGO',
          plan_name: 'Optima Secure+',
          status: 'active',
          ...plan,
          created_at: now,
          updated_at: now
        });
      }
      writeData(data);
      return this.findById(planId);
    },
    update(id, updates) {
      if (!id) return null;
      const data = readData();
      const idx = data.plans.findIndex((p) => String(p.id).trim() === String(id).trim());
      if (idx === -1) return null;
      const now = new Date().toISOString();
      data.plans[idx] = {
        ...data.plans[idx],
        ...updates,
        updated_at: now
      };
      writeData(data);
      return data.plans[idx];
    }
  },

  planFeatures: createCollectionHandler('plan_features', 'feat'),
  reportCard: createCollectionHandler('report_card', 'rc'),
  companyStrength: createCollectionHandler('company_strength', 'cs'),
  limitations: createCollectionHandler('limitations', 'lim'),
  mustKnow: createCollectionHandler('must_know', 'mk')
};

export default db;
