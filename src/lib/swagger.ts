import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Ngurra Flora API",
      version: "1.0.0",
      description:
        "A RESTful backend service for Australian native and indigenous plants. Provides taxonomic data, geographic occurrence records with PostGIS spatial queries.",
    },
    servers: [
      {
        url: "/",
      },
    ],
    tags: [
      { name: "Auth" },
      { name: "Plants" },
      { name: "Occurrences" },
      { name: "Tags" },
      { name: "Regions" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Role: {
          type: "string",
          enum: ["VIEWER", "CONTRIBUTOR", "ADMIN"],
        },
        ConservationStatus: {
          type: "string",
          enum: [
            "NOT_EVALUATED",
            "LEAST_CONCERN",
            "NEAR_THREATENED",
            "VULNERABLE",
            "ENDANGERED",
            "CRITICALLY_ENDANGERED",
            "EXTINCT_IN_WILD",
            "EXTINCT",
          ],
        },

        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            role: { $ref: "#/components/schemas/Role" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        AuthResponse: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/User" },
            token: { type: "string", description: "JWT token" },
          },
        },

        Region: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Queensland" },
            code: { type: "string", example: "QLD" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        RegionWithCounts: {
          allOf: [
            { $ref: "#/components/schemas/Region" },
            {
              type: "object",
              properties: {
                _count: {
                  type: "object",
                  properties: {
                    plantRegions: { type: "integer" },
                    occurrences: { type: "integer" },
                  },
                },
              },
            },
          ],
        },

        Tag: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "edible" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        TagWithCounts: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "edible" },
            createdAt: { type: "string", format: "date-time" },
            _count: {
              type: "object",
              properties: {
                plantTags: { type: "integer" },
              },
            },
          },
        },

        PlantSummary: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            scientificName: { type: "string", example: "Acacia pycnantha" },
            commonName: { type: "string", nullable: true, example: "Golden Wattle" },
            family: { type: "string", nullable: true, example: "Fabaceae" },
            conservationStatus: { $ref: "#/components/schemas/ConservationStatus" },
          },
        },

        Plant: {
          allOf: [
            { $ref: "#/components/schemas/PlantSummary" },
            {
              type: "object",
              properties: {
                genus: { type: "string", nullable: true },
                author: { type: "string", nullable: true },
                description: { type: "string", nullable: true },
                externalId: { type: "string", nullable: true },
                plantRegions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      region: { $ref: "#/components/schemas/Region" },
                    },
                  },
                },
                plantTags: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      tag: { $ref: "#/components/schemas/Tag" },
                    },
                  },
                },
              },
            },
          ],
        },

        RegionRef: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Queensland" },
            code: { type: "string", example: "QLD" },
          },
          nullable: true,
        },

        Occurrence: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            plant: { $ref: "#/components/schemas/PlantSummary" },
            region: { $ref: "#/components/schemas/RegionRef" },
            latitude: { type: "number", example: -27.4705 },
            longitude: { type: "number", example: 153.026 },
            recordedDate: { type: "string", format: "date-time", nullable: true },
            basisOfRecord: { type: "string", nullable: true, example: "HUMAN_OBSERVATION" },
            dataProvider: { type: "string", nullable: true, example: "iNaturalist Australia" },
            externalId: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            totalPages: { type: "integer", example: 5 },
          },
        },

        Error: {
          type: "object",
          properties: {
            error: { type: "string", example: "Resource not found" },
          },
        },

        ValidationError: {
          type: "object",
          properties: {
            error: { type: "string", example: "Validation failed" },
            details: {
              type: "object",
              additionalProperties: {
                type: "array",
                items: { type: "string" },
              },
              example: { scientificName: ["Scientific name is required"] },
            },
          },
        },
      },
    },
  },
  apis: process.env.NODE_ENV === "production" ? ["./dist/routes/*.js"] : ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
