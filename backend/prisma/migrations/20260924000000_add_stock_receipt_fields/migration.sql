-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN "bitrixDocumentId" TEXT;

-- AlterTable
ALTER TABLE "ImportRecord" ADD COLUMN "bitrixDocumentId" TEXT,
ADD COLUMN "warehouseId" INTEGER,
ADD COLUMN "quantityArrived" DOUBLE PRECISION,
ADD COLUMN "purchasePrice" DOUBLE PRECISION,
ADD COLUMN "salesPrice" DOUBLE PRECISION;
