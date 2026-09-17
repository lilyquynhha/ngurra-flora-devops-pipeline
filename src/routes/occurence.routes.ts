import { Router } from "express";
import {
  getAllOccurrences,
  getOccurrencesByPlant,
  getNearbyOccurrences,
  getOccurrencesInBbox,
  createOccurrence,
  updateOccurrence,
  deleteOccurrence,
} from "../controllers/occurrence.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  CreateOccurrenceSchema,
  UpdateOccurenceSchema,
  validate,
} from "../lib/schemaValidation.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Occurrences
 *   description: Plant sighting records with PostGIS spatial queries
 */

/**
 * @swagger
 * /occurrences:
 *   get:
 *     summary: List all occurrences with pagination and filtering
 *     tags: [Occurrences]
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
 *         name: plantId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: regionId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Paginated occurrence records
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
 *                     $ref: '#/components/schemas/Occurrence'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       404:
 *         description: Plant or region not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   post:
 *     summary: Create an occurrence (CONTRIBUTOR or ADMIN)
 *     tags: [Occurrences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plantId, latitude, longitude]
 *             properties:
 *               plantId:
 *                 type: string
 *                 format: uuid
 *               latitude:
 *                 type: number
 *                 example: -27.4705
 *               longitude:
 *                 type: number
 *                 example: 153.026
 *               recordedDate:
 *                 type: string
 *                 format: date-time
 *               basisOfRecord:
 *                 type: string
 *                 example: HUMAN_OBSERVATION
 *               dataProvider:
 *                 type: string
 *                 example: iNaturalist Australia
 *               regionCode:
 *                 type: string
 *                 example: QLD
 *                 description: Automatically resolved to a regionId if it matches a known region code
 *     responses:
 *       201:
 *         description: Occurrence created with PostGIS location set
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Occurrence'
 *       400:
 *         description: Validation error or missing required fields
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
 *       404:
 *         description: Plant or region not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", getAllOccurrences);
router.post(
  "/",
  authenticate,
  requireRole("ADMIN", "CONTRIBUTOR"),
  validate(CreateOccurrenceSchema),
  createOccurrence,
);

/**
 * @swagger
 * /occurrences/plant/{plantId}:
 *   get:
 *     summary: Get all occurrences for a specific plant
 *     tags: [Occurrences]
 *     parameters:
 *       - in: path
 *         name: plantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *     responses:
 *       200:
 *         description: Paginated occurrences for the plant
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
 *                     $ref: '#/components/schemas/Occurrence'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       404:
 *         description: Plant not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/plant/:plantId", getOccurrencesByPlant);

/**
 * @swagger
 * /occurrences/nearby:
 *   get:
 *     summary: Find occurrences within a radius of a coordinate (PostGIS)
 *     tags: [Occurrences]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         example: -27.4705
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         example: 153.026
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 50
 *         description: Radius in kilometres
 *     responses:
 *       200:
 *         description: Occurrences within the radius ordered by distance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Occurrence'
 *                       - type: object
 *                         properties:
 *                           distance_km:
 *                             type: number
 *                             example: 12.47
 *                 meta:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *                     radiusKm:
 *                       type: number
 *                     total:
 *                       type: integer
 *       400:
 *         description: Missing or invalid coordinates
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/nearby", getNearbyOccurrences);

/**
 * @swagger
 * /occurrences/bbox:
 *   get:
 *     summary: Find occurrences within a bounding box (PostGIS)
 *     tags: [Occurrences]
 *     parameters:
 *       - in: query
 *         name: minLng
 *         required: true
 *         schema:
 *           type: number
 *         example: 152.0
 *       - in: query
 *         name: minLat
 *         required: true
 *         schema:
 *           type: number
 *         example: -28.0
 *       - in: query
 *         name: maxLng
 *         required: true
 *         schema:
 *           type: number
 *         example: 154.0
 *       - in: query
 *         name: maxLat
 *         required: true
 *         schema:
 *           type: number
 *         example: -27.0
 *     responses:
 *       200:
 *         description: Occurrences within the bounding box
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Occurrence'
 *       400:
 *         description: Missing bbox parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/bbox", getOccurrencesInBbox);

/**
 * @swagger
 * /occurrences/{id}:
 *   patch:
 *     summary: Update an occurrence (ADMIN or CONTRIBUTOR)
 *     tags: [Occurrences]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plantId:
 *                 type: string
 *                 format: uuid
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               recordedDate:
 *                 type: string
 *                 format: date-time
 *               basisOfRecord:
 *                 type: string
 *               dataProvider:
 *                 type: string
 *               externalId:
 *                 type: string
 *               regionCode:
 *                 type: string
 *                 example: QLD
 *     responses:
 *       200:
 *         description: Occurrence updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Occurrence'
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
 *         description: Insufficient permissions (CONTRIBUTOR or ADMIN required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Occurrence or region not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     summary: Delete an occurrence (ADMIN only)
 *     tags: [Occurrences]
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
 *         description: Occurrence deleted
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
 *         description: Occurrence not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(
  "/:id",
  authenticate,
  requireRole("ADMIN", "CONTRIBUTOR"),
  validate(UpdateOccurenceSchema),
  updateOccurrence,
);
router.delete("/:id", authenticate, requireRole("ADMIN"), deleteOccurrence);

export default router;
