/** PostgreSQL JSONB käwagt string bolup gelýär (täze PC / restore). */

function parseJsonValue(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }
  return raw;
}

function parseJsonObject(raw) {
  const v = parseJsonValue(raw, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function parseJsonArray(raw) {
  const v = parseJsonValue(raw, []);
  return Array.isArray(v) ? v : [];
}

function jsonGetter(fallback) {
  return function get() {
    const key = this.constructor?.rawAttributes
      ? Object.keys(this.constructor.rawAttributes).find((k) => (
        this.constructor.rawAttributes[k] && this.getDataValue(k) !== undefined
      ))
      : null;
    // Sequelize getter uses the field it is attached to via getDataValue(fieldName)
    return parseJsonValue(this.getDataValue(this._jsonFieldName || key), fallback);
  };
}

function attachJsonGetters(fields) {
  const out = {};
  Object.entries(fields).forEach(([name, spec]) => {
    const fallback = spec.defaultValue !== undefined
      ? spec.defaultValue
      : (spec.type && String(spec.type).includes('JSONB') ? (Array.isArray(spec.defaultValue) ? [] : {}) : undefined);
    const fb = Array.isArray(spec.defaultValue) ? [] : (spec.defaultValue && typeof spec.defaultValue === 'object' ? {} : spec.defaultValue);
    out[name] = {
      ...spec,
      get() {
        return parseJsonValue(this.getDataValue(name), fb);
      },
    };
  });
  return out;
}

module.exports = {
  parseJsonValue,
  parseJsonValue: parseJsonValue,
  parseJsonObject,
  parseJsonArray,
};
