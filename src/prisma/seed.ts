import axios from "axios";
import prisma from "../lib/prisma.js";
import { Region } from "./generated/prisma/client.js";

// --- API URL

const ALA_SPECIES_URL = "https://api.ala.org.au/species";
const ALA_BIOCACHE_URL = "https://biocache-ws.ala.org.au/ws";

const PLANT_COUNT = 50;
const OCCURRENCES_PER_PLANT = 20;

// --- API responses DTO

interface AlaSearchResponse {
  searchResults: {
    totalRecords: number;
    results: AlaSpecies[];
  };
}

interface AlaSpecies {
  guid: string;
  scientificName: string;
  commonNameSingle?: string;
  family?: string;
  genus?: string;
  author?: string;
  conservationStatus?: string;
  imageUrl?: string;
  occurrenceCount?: number;
}

interface AlaBiocacheResponse {
  occurrences: AlaOccurrence[];
  totalRecords: number;
}

interface AlaOccurrence {
  uuid: string;
  decimalLatitude: number;
  decimalLongitude: number;
  eventDate?: string;
  basisOfRecord?: string;
  dataProviderName?: string;
  stateProvince?: string;
}

// --- Map ALA conservation status string to Prisma enum

const mapConservationStatus = (status: string | undefined) => {
  if (!status) return "NOT_EVALUATED";

  const s = status.toUpperCase();

  if (s.includes("EXTINCT IN THE WILD")) return "EXTINCT_IN_WILD";
  if (s.includes("EXTINCT")) return "EXTINCT";
  if (s.includes("CRITICALLY ENDANGERED")) return "CRITICALLY_ENDANGERED";
  if (s.includes("ENDANGERED")) return "ENDANGERED";
  if (s.includes("VULNERABLE")) return "VULNERABLE";
  if (s.includes("NEAR THREATENED")) return "NEAR_THREATENED";
  if (s.includes("LEAST CONCERN")) return "LEAST_CONCERN";

  return "NOT_EVALUATED";
};

// --- Seed regions

const seedRegions = async () => {
  console.log("Seeding regions...");

  const regions = [
    { name: "Australian Capital Territory", code: "ACT" },
    { name: "New South Wales", code: "NSW" },
    { name: "Northern Territory", code: "NT" },
    { name: "Queensland", code: "QLD" },
    { name: "South Australia", code: "SA" },
    { name: "Tasmania", code: "TAS" },
    { name: "Victoria", code: "VIC" },
    { name: "Western Australia", code: "WA" },
  ];

  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: {},
      create: region,
    });
  }

  console.log(`  -> ${regions.length} regions seeded`);
};

// --- Seed tags

const seedTags = async () => {
  console.log("Seeding tags...");

  const tags = [
    "edible",
    "medicinal",
    "endangered",
    "coastal",
    "flowering",
    "rainforest",
    "wetland",
    "invasive",
  ];

  for (const name of tags) {
    await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log(`  -> ${tags.length} tags seeded`);
};

// --- Fetch plants from ALA Species API

const fetchPlants = async (): Promise<AlaSpecies[]> => {
  console.log(`Fetching ${PLANT_COUNT} plants from ALA Species API...`);

  const response = await axios.get<AlaSearchResponse>(`${ALA_SPECIES_URL}/search`, {
    params: {
      q: "rk_kingdom:Plantae",
      fq: "commonNameSingle:*",
      pageSize: PLANT_COUNT,
      start: 0,
      sort: "occurrenceCount",
      dir: "desc",
    },
  });

  const results = response.data.searchResults?.results ?? [];
  console.log(`  -> Fetched ${results.length} plants`);
  return results;
};

// --- Seed fetched plants into database

const seedPlants = async (plants: AlaSpecies[]) => {
  console.log("Seeding plants...");

  let seeded = 0;
  let skipped = 0;

  for (const plant of plants) {
    if (!plant.scientificName || !plant.guid) {
      skipped++;
      continue;
    }

    await prisma.plant.upsert({
      where: { externalId: plant.guid },
      update: {},
      create: {
        scientificName: plant.scientificName,
        commonName: plant.commonNameSingle ?? null,
        family: plant.family ?? null,
        genus: plant.genus ?? null,
        author: plant.author ?? null,
        conservationStatus: mapConservationStatus(plant.conservationStatus) as any,
        imageUrl: plant.imageUrl ?? null,
        externalId: plant.guid,
      },
    });

    seeded++;
  }

  console.log(`  -> ${seeded} plants seeded, ${skipped} skipped`);
};

// --- Fetch occurrences from ALA Biocache API for each plant

const fetchOccurrences = async (plantGuid: string): Promise<AlaOccurrence[]> => {
  const response = await axios.get<AlaBiocacheResponse>(`${ALA_BIOCACHE_URL}/occurrences/search`, {
    params: {
      q: `lsid:${plantGuid}`,
      pageSize: OCCURRENCES_PER_PLANT,
      fl: "id,decimalLatitude,decimalLongitude,eventDate,basisOfRecord,dataProviderName,stateProvince",
    },
  });

  return response.data.occurrences ?? [];
};

// --- Seed occurrences and derive plant-region links

const seedOccurrencesAndRegions = async (plants: AlaSpecies[]) => {
  console.log("Seeding occurrences and linking plants to regions...");

  // Retrieve all regions for linking
  const allRegions = await prisma.region.findMany();

  // Region Hashap
  // Key: region's name. Value: the full region record
  const regionByName = new Map(allRegions.map((r: Region) => [r.name.toLowerCase(), r]));

  let totalOccurrences = 0;
  let totalRegionLinks = 0;

  // Fetch occurences for each fetched plant
  for (const plant of plants) {
    const dbPlant = await prisma.plant.findUnique({
      where: { externalId: plant.guid },
    });

    if (!dbPlant) continue;

    // Fetch occurences
    let occurrences = await fetchOccurrences(plant.guid);

    // Regions linked to this plant
    const linkedRegionIds = new Set<string>();

    // For each occurence: Update the location column & Link plant to region
    for (const occ of occurrences) {
      const regionKey = occ.stateProvince?.toLowerCase();
      const region : Region | null | undefined = regionKey ? regionByName.get(regionKey) : null;
      const regionId = region?.id ?? null;

      // Seed the occurence
      let createdOcc = await prisma.occurrence.upsert({
        where: { externalId: occ.uuid },
        update: {},
        create: {
          plantId: dbPlant.id,
          latitude: occ.decimalLatitude,
          longitude: occ.decimalLongitude,
          recordedDate: occ.eventDate ? new Date(occ.eventDate) : null,
          basisOfRecord: occ.basisOfRecord ?? null,
          dataProvider: occ.dataProviderName ?? null,
          externalId: occ.uuid,
          regionId,
        },
      });

      // Update the PostGIS location column
      await prisma.$executeRaw`
        UPDATE occurrences
        SET location = ST_SetSRID(
          ST_MakePoint(${occ.decimalLongitude}, ${occ.decimalLatitude}),
          4326
        )::geography
        WHERE id = ${createdOcc.id}
      `;

      totalOccurrences++;

      // Link plant to the region if not linked
      if (regionId && !linkedRegionIds.has(regionId)) {
        await prisma.plantRegion.upsert({
          where: {
            plantId_regionId: { plantId: dbPlant.id, regionId },
          },
          update: {},
          create: { plantId: dbPlant.id, regionId },
        });

        linkedRegionIds.add(regionId);
        totalRegionLinks++;
      }
    }
  }

  console.log(`  -> ${totalOccurrences} occurrences seeded`);
  console.log(`  -> ${totalRegionLinks} plant-region links created`);
};

// --- Auto-assign tags based on conservation status and plant family

const seedPlantTags = async () => {
  console.log("Assigning tags to plants...");

  const endangeredTag = await prisma.tag.findUnique({ where: { name: "endangered" } });
  const floweringTag = await prisma.tag.findUnique({ where: { name: "flowering" } });

  if (endangeredTag) {
    const endangeredPlants = await prisma.plant.findMany({
      where: {
        conservationStatus: { in: ["ENDANGERED", "CRITICALLY_ENDANGERED", "VULNERABLE"] },
      },
    });

    for (const plant of endangeredPlants) {
      await prisma.plantTag.upsert({
        where: { plantId_tagId: { plantId: plant.id, tagId: endangeredTag.id } },
        update: {},
        create: { plantId: plant.id, tagId: endangeredTag.id },
      });
    }

    console.log(`  -> Tagged ${endangeredPlants.length} plants as "endangered"`);
  }

  if (floweringTag) {
    const floweringFamilies = ["Myrtaceae", "Proteaceae", "Fabaceae", "Asteraceae", "Orchidaceae"];
    const floweringPlants = await prisma.plant.findMany({
      where: { family: { in: floweringFamilies } },
    });

    for (const plant of floweringPlants) {
      await prisma.plantTag.upsert({
        where: { plantId_tagId: { plantId: plant.id, tagId: floweringTag.id } },
        update: {},
        create: { plantId: plant.id, tagId: floweringTag.id },
      });
    }

    console.log(`  -> Tagged ${floweringPlants.length} plants as "flowering"`);
  }
};

const main = async () => {
  console.log("Starting seed...\n");

  try {
    await seedRegions();
    await seedTags();

    const plants = await fetchPlants();
    await seedPlants(plants);
    await seedOccurrencesAndRegions(plants);
    await seedPlantTags();

    console.log("\nSeed completed successfully.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();
