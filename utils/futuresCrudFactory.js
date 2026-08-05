// Shared CRUD handler factory for the Fame Futures entities that don't need
// bespoke business logic (qualification gates, Stripe, Claude) — the pattern
// across ~10 of the 18 new models is identical (list/get/create/update/delete
// scoped to the logged-in user's own records, admin can touch any), so this
// avoids hand-writing that boilerplate 10 times. Entities with real custom
// logic (FuturesTalentProfile, Membership, AdvisorChat, etc.) get their own
// controllers instead of using this.
const isAdmin = (user) =>
  user && (user.isAdmin === true || String(user.role).toUpperCase() === "ADMIN");

/**
 * @param {import("mongoose").Model} Model
 * @param {object} opts
 * @param {string} [opts.ownerField] - field name (e.g. "talentId") auto-set to
 *   req.user._id on create, and used to scope list/update/delete to the
 *   owner unless the caller is admin. Omit for entities with no single owner
 *   (e.g. FuturesVideoLesson, which is platform-authored).
 * @param {boolean} [opts.publicList] - if true, GET / requires no auth at all
 *   (still supports query filters); if false, only returns the caller's own
 *   records (or all, if admin).
 * @param {boolean} [opts.adminWriteOnly] - for platform-authored content with
 *   no single owner (e.g. FuturesVideoLesson, FuturesXPReward) — only an
 *   admin may create/update/delete, regardless of who's calling.
 */
export function makeFuturesCrud(
  Model,
  { ownerField = null, publicList = false, adminWriteOnly = false } = {}
) {
  const scopeFilter = (req) => {
    if (!ownerField) return {};
    if (isAdmin(req.user)) return {};
    return { [ownerField]: req.user._id };
  };

  return {
    list: async (req, res) => {
      try {
        const filter = publicList ? {} : scopeFilter(req);
        // Shallow query-param filters on the entity's own fields, e.g.
        // ?status=active — matches this codebase's existing simple-filter
        // convention (controllers/teamController.js's listTeam and friends).
        for (const [key, value] of Object.entries(req.query)) {
          if (key in Model.schema.paths) filter[key] = value;
        }
        const data = await Model.find(filter).sort({ createdAt: -1 }).lean();
        res.json({ success: true, count: data.length, data });
      } catch (e) {
        res.status(500).json({ success: false, message: e.message });
      }
    },

    get: async (req, res) => {
      try {
        const doc = await Model.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ success: false, message: "Not found" });
        if (ownerField && !isAdmin(req.user) && String(doc[ownerField]) !== String(req.user._id)) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }
        res.json({ success: true, data: doc });
      } catch (e) {
        res.status(500).json({ success: false, message: e.message });
      }
    },

    create: async (req, res) => {
      try {
        if (adminWriteOnly && !isAdmin(req.user)) {
          return res.status(403).json({ success: false, message: "Admin only" });
        }
        const body = { ...req.body };
        if (ownerField) body[ownerField] = req.user._id;
        const created = await Model.create(body);
        res.status(201).json({ success: true, data: created });
      } catch (e) {
        res.status(400).json({ success: false, message: e.message });
      }
    },

    update: async (req, res) => {
      try {
        if (adminWriteOnly && !isAdmin(req.user)) {
          return res.status(403).json({ success: false, message: "Admin only" });
        }
        const existing = await Model.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, message: "Not found" });
        if (ownerField && !isAdmin(req.user) && String(existing[ownerField]) !== String(req.user._id)) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }
        // Never let the caller reassign ownership or _id via a bulk update.
        const body = { ...req.body };
        delete body._id;
        if (ownerField) delete body[ownerField];
        const updated = await Model.findByIdAndUpdate(req.params.id, body, {
          new: true,
          runValidators: true,
        });
        res.json({ success: true, data: updated });
      } catch (e) {
        res.status(400).json({ success: false, message: e.message });
      }
    },

    remove: async (req, res) => {
      try {
        if (adminWriteOnly && !isAdmin(req.user)) {
          return res.status(403).json({ success: false, message: "Admin only" });
        }
        const existing = await Model.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, message: "Not found" });
        if (ownerField && !isAdmin(req.user) && String(existing[ownerField]) !== String(req.user._id)) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }
        await Model.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Deleted" });
      } catch (e) {
        res.status(500).json({ success: false, message: e.message });
      }
    },
  };
}
