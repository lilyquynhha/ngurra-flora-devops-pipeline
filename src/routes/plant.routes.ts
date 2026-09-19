import { Router } from "express";
import {
  getAllPlants,
  getPlantById,
  createPlant,
  updatePlant,
  deletePlant,
  linkPlantToRegion,
  unlinkPlantFromRegion,
  getNearbyPlants,
  linkPlantToTag,
  unlinkPlantFromTag,
} from "../controllers/plant.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { CreatePlantSchema, UpdatePlantSchema, validate } from "../lib/schemaValidation.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Plants
 *   description: Australian native plant species
 */

/**
 * @swagger
 * /plants:
 *   get:
 *     summary: List all plants with pagination and filtering
 *     tags: [Plants]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by scientific name or common name
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by region ID
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by tag ID
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/ConservationStatus'
 *         description: Filter by conservation status
 *     responses:
 *       200:
 *         description: Paginated list of plants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Plant'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *   post:
 *     summary: Create a new plant (CONTRIBUTOR or ADMIN)
 *     tags: [Plants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scientificName]
 *             properties:
 *               scientificName:
 *                 type: string
 *                 example: Acacia pycnantha
 *               commonName:
 *                 type: string
 *                 example: Golden Wattle
 *               family:
 *                 type: string
 *                 example: Fabaceae
 *               genus:
 *                 type: string
 *                 example: Acacia
 *               author:
 *                 type: string
 *                 example: Benth.
 *               conservationStatus:
 *                 $ref: '#/components/schemas/ConservationStatus'
 *               description:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *                 format: uri
 *               externalId:
 *                 type: string
 *               regionIds:
 *                 type: array
 *                 description: IDs of regions to link this plant to on creation
 *                 items:
 *                   type: string
 *                   format: uuid
 *               tagIds:
 *                 type: array
 *                 description: IDs of tags to link this plant to on creation
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       201:
 *         description: Plant created with region and tag associations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Plant'
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (CONTRIBUTOR or ADMIN required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Scientific name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", getAllPlants);
router.post(
  "/",
  authenticate,
  requireRole("ADMIN", "CONTRIBUTOR"),
  validate(CreatePlantSchema),
  createPlant,
);

/**
 * @swagger
 * /plants/nearby:
 *   get:
 *     summary: Get distinct plant species observed near a coordinate
 *     tags: [Plants]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         description: Latitude (-90 to 90)
 *         example: -37.8136
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         description: Longitude (-180 to 180)
 *         example: 144.9631
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 50
 *         description: Search radius in kilometres
 *     responses:
 *       200:
 *         description: Plants observed near the given coordinate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/PlantSummary'
 *                       - type: object
 *                         properties:
 *                           occurrence_count:
 *                             type: integer
 *                           nearest_sighting_km:
 *                             type: number
 *                 meta:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *                     radiusKm:
 *                       type: number
 *       400:
 *         description: Missing or invalid coordinates
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/nearby", getNearbyPlants);

/**
 * @swagger
 * /plants/{id}:
 *   get:
 *     summary: Get a plant by ID with full details
 *     tags: [Plants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Full plant record with regions, tags and recent occurrences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Plant'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (ADMIN only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Plant not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   patch:
 *     summary: Update a plant's fields and/or associations (CONTRIBUTOR or ADMIN)
 *     tags: [Plants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scientificName:
 *                 type: string
 *               commonName:
 *                 type: string
 *                 nullable: true
 *               family:
 *                 type: string
 *                 nullable: true
 *               genus:
 *                 type: string
 *                 nullable: true
 *               author:
 *                 type: string
 *                 nullable: true
 *               conservationStatus:
 *                 $ref: '#/components/schemas/ConservationStatus'
 *               description:
 *                 type: string
 *                 nullable: true
 *               imageUrl:
 *                 type: string
 *                 nullable: true
 *               regionIds:
 *                 type: array
 *                 nullable: true
 *                 description: >
 *                   Replaces all region associations. Pass undefined to leave
 *                   unchanged. Pass [] to remove all. Pass [...ids] to set
 *                   exactly these regions.
 *                 items:
 *                   type: string
 *                   format: uuid
 *               tagIds:
 *                 type: array
 *                 nullable: true
 *                 description: >
 *                   Replaces all tag associations. Pass undefined to leave
 *                   unchanged. Pass [] to remove all. Pass [...ids] to set
 *                   exactly these tags.
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Updated plant with refreshed associations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Plant'
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Plant not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     summary: Delete a plant (ADMIN only)
 *     tags: [Plants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Plant deleted
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Plant not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/:id", getPlantById);
router.patch(
  "/:id",
  authenticate,
  requireRole("ADMIN", "CONTRIBUTOR"),
  validate(UpdatePlantSchema),
  updatePlant,
);
router.delete("/:id", authenticate, requireRole("ADMIN"), deletePlant);

// Region association
/**
 * @swagger
 * /plants/{id}/regions/{regionId}:
 *   post:
 *     summary: Link a plant to a region (CONTRIBUTOR or ADMIN)
 *     tags: [Plants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: regionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Region linked to plant
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (CONTRIBUTOR or ADMIN required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Plant or region not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Region already linked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     summary: Unlink a plant from a region (ADMIN only)
 *     tags: [Plants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: regionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Unlinked plant from region
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (ADMIN only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Invalid IDs / Plant not linked to region
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/:id/regions/:regionId",
  authenticate,
  requireRole("ADMIN", "CONTRIBUTOR"),
  linkPlantToRegion,
);
router.delete("/:id/regions/:regionId", authenticate, requireRole("ADMIN"), unlinkPlantFromRegion);

// Tag association
/**
 * @swagger
 * /plants/{id}/tags/{tagId}:
 *   post:
 *     summary: Link a tag to a plant (CONTRIBUTOR or ADMIN)
 *     tags: [Plants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Tag linked to plant
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (CONTRIBUTOR or ADMIN required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Plant or tag not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Tag already linked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     summary: Unlink a tag from a plant (ADMIN only)
 *     tags: [Plants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Unlinked plant from tag
 *       401:
 *         description: Missing or invalid authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (ADMIN only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Invalid IDs / Plant not linked to tag
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/:id/tags/:tagId", authenticate, requireRole("ADMIN", "CONTRIBUTOR"), linkPlantToTag);
router.delete("/:id/tags/:tagId", authenticate, requireRole("ADMIN"), unlinkPlantFromTag);

export default router;
