// Entity Hub Routes
//
// Exposes:
//   GET  /api/brands/:brandId/entity/score        — full entity score breakdown
//   GET  /api/brands/:brandId/entity/profile      — current entity profile
//   PUT  /api/brands/:brandId/entity/profile      — update entity profile (canonical fields)
//   GET  /api/brands/:brandId/entity/links        — list of platform/entity links
//   POST /api/brands/:brandId/entity/links        — add a link
//   DELETE /api/brands/:brandId/entity/links/:id  — remove a link
//   GET  /api/brands/:brandId/entity/people       — people in the brand's orbit
//   POST /api/brands/:brandId/entity/people       — add a person
//   PUT  /api/brands/:brandId/entity/people/:id   — update a person
//   DELETE /api/brands/:brandId/entity/people/:id — remove a person
//   GET  /api/brands/:brandId/entity/sources     — citation sources
//   POST /api/brands/:brandId/entity/sources      — add citation
//   GET  /api/brands/:brandId/entity/ground-truth — ground truth
//   POST /api/brands/:brandId/entity/ground-truth — add ground truth
//   GET  /api/brands/:brandId/entity/social       — social presence
//   POST /api/brands/:brandId/entity/social       — upsert social presence
//   GET  /api/brands/:brandId/entity/associations — topic associations
//   GET  /api/brands/:brandId/entity/disambiguation/stats
//   GET  /api/brands/:brandId/entity/retrieval/stats
//   GET  /api/brands/:brandId/entity/kg-status
//   POST /api/brands/:brandId/entity/refresh     — recompute entity score (and clear cache)

import { Router } from "express";
import { storage } from "../storage";
import { computeEntityScore } from "../services/entity-intelligence";
import { requireAuth } from "../auth-middleware";

export const entityRouter = Router({ mergeParams: true });

entityRouter.use("/:brandId/entity", requireAuth, async (req: any, res, next) => {
  try {
    const brand = await storage.getBrand(req.params.brandId);
    const userId = req.userId || req.user?.id;
    const user = userId ? await storage.getUser(userId).catch(() => undefined) : undefined;
    if (!brand || (brand.userId !== userId && !user?.isAdmin)) {
      return res.status(404).json({ error: "Brand not found" });
    }
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= SCORE =============

entityRouter.get("/:brandId/entity/score", async (req, res) => {
  try {
    const score = await computeEntityScore(storage, req.params.brandId);
    res.json(score);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.post("/:brandId/entity/refresh", async (req, res) => {
  try {
    const score = await computeEntityScore(storage, req.params.brandId);
    res.json(score);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= PROFILE =============

entityRouter.get("/:brandId/entity/profile", async (req, res) => {
  try {
    const profile = await storage.getEntityProfileByBrand(req.params.brandId);
    res.json(profile ?? null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.put("/:brandId/entity/profile", async (req, res) => {
  try {
    const { shortDescription, description, aliases: rawAliases, ...body } = req.body || {};
    const aliases = Array.isArray(rawAliases) ? rawAliases.filter(Boolean) : undefined;
    const profile = await storage.upsertEntityProfile({
      ...body,
      brandId: req.params.brandId,
      entityDescription: body.entityDescription || description || shortDescription,
      dbaNames: body.dbaNames || aliases,
    });
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= LINKS =============

entityRouter.get("/:brandId/entity/links", async (req, res) => {
  try {
    const links = await storage.getEntityLinksByBrand(req.params.brandId);
    res.json(links);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.post("/:brandId/entity/links", async (req, res) => {
  try {
    const { label, category, ...body } = req.body || {};
    const link = await storage.createEntityLink({
      ...body,
      brandId: req.params.brandId,
      platform: body.platform || label || category || "authority",
      source: body.source || "onboarding",
    });
    res.json(link);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.delete("/:brandId/entity/links/:id", async (req, res) => {
  try {
    await storage.deleteEntityLink(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= PEOPLE =============

entityRouter.get("/:brandId/entity/people", async (req, res) => {
  try {
    const people = await storage.getPeopleByBrand(req.params.brandId);
    res.json(people);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.post("/:brandId/entity/people", async (req, res) => {
  try {
    const person = await storage.createPerson({ ...req.body, brandId: req.params.brandId });
    res.json(person);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.put("/:brandId/entity/people/:id", async (req, res) => {
  try {
    const person = await storage.updatePerson(req.params.id, req.body);
    res.json(person);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.delete("/:brandId/entity/people/:id", async (req, res) => {
  try {
    await storage.deletePerson(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= SOURCES (CITATIONS) =============

entityRouter.get("/:brandId/entity/sources", async (req, res) => {
  try {
    const sources = await storage.getSourcesByBrand(req.params.brandId);
    res.json(sources);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.post("/:brandId/entity/sources", async (req, res) => {
  try {
    const source = await storage.createSource({ ...req.body, brandId: req.params.brandId });
    res.json(source);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= GROUND TRUTH =============

entityRouter.get("/:brandId/entity/ground-truth", async (req, res) => {
  try {
    const truths = await storage.getGroundTruthByBrand(req.params.brandId);
    res.json(truths);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.post("/:brandId/entity/ground-truth", async (req, res) => {
  try {
    const truth = await storage.upsertGroundTruth({ ...req.body, brandId: req.params.brandId });
    res.json(truth);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= SOCIAL PRESENCE =============

entityRouter.get("/:brandId/entity/social", async (req, res) => {
  try {
    const presence = await storage.getEntitySocialPresenceByBrand(req.params.brandId);
    res.json(presence);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.post("/:brandId/entity/social", async (req, res) => {
  try {
    const row = await storage.upsertEntitySocialPresence({ ...req.body, brandId: req.params.brandId });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= TOPIC ASSOCIATIONS =============

entityRouter.get("/:brandId/entity/associations", async (req, res) => {
  try {
    const assocs = await storage.getTopicEntityAssociationsByBrand(req.params.brandId);
    res.json(assocs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= DISAMBIGUATION & RETRIEVAL STATS =============

entityRouter.get("/:brandId/entity/disambiguation/stats", async (req, res) => {
  try {
    const stats = await storage.getDisambiguationStats(req.params.brandId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.get("/:brandId/entity/retrieval/stats", async (req, res) => {
  try {
    const stats = await storage.getRetrievalStats(req.params.brandId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.get("/:brandId/entity/disambiguation/tests", async (req, res) => {
  try {
    const tests = await storage.getEntityDisambiguationTestsByBrand(req.params.brandId);
    res.json(tests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

entityRouter.get("/:brandId/entity/retrieval/tests", async (req, res) => {
  try {
    const tests = await storage.getRetrievalTestsByBrand(req.params.brandId);
    res.json(tests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= KNOWLEDGE GRAPH STATUS =============

entityRouter.get("/:brandId/entity/kg-status", async (req, res) => {
  try {
    const status = await storage.getKnowledgeGraphStatus(req.params.brandId);
    res.json(status ?? null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============= COMMUNITY VALIDATION =============

entityRouter.get("/:brandId/entity/community-validation", async (req, res) => {
  try {
    const v = await storage.getCommunityValidationByBrand(req.params.brandId);
    res.json(v);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
