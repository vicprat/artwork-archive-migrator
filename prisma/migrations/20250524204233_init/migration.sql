-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('ARTWORK_ARCHIVE', 'WOOCOMMERCE');

-- CreateEnum
CREATE TYPE "DuplicateResolution" AS ENUM ('PENDING', 'KEEP_ARTWORK', 'KEEP_WOO', 'KEEP_BOTH', 'MERGED');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_html" TEXT,
    "vendor" TEXT,
    "product_category" TEXT,
    "type" TEXT,
    "tags" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "seo_title" TEXT,
    "seo_description" TEXT,
    "variant_sku" TEXT,
    "variantPrice" DECIMAL(10,2) NOT NULL,
    "variant_compare_at_price" DECIMAL(10,2),
    "variant_grams" INTEGER,
    "variant_inventory_tracker" TEXT,
    "variant_inventory_qty" INTEGER,
    "variant_inventory_policy" TEXT,
    "variant_fulfillment_service" TEXT,
    "variant_requires_shipping" BOOLEAN,
    "variant_taxable" BOOLEAN,
    "variant_barcode" TEXT,
    "variant_weight_unit" TEXT,
    "variant_tax_code" TEXT,
    "cost_per_item" DECIMAL(10,2),
    "option1_name" TEXT,
    "option1_value" TEXT,
    "option2_name" TEXT,
    "option2_value" TEXT,
    "option3_name" TEXT,
    "option3_value" TEXT,
    "google_product_category" TEXT,
    "google_gender" TEXT,
    "google_age_group" TEXT,
    "google_mpn" TEXT,
    "google_condition" TEXT,
    "google_custom_product" TEXT,
    "gift_card" BOOLEAN NOT NULL DEFAULT false,
    "included_us" BOOLEAN,
    "price_us" DECIMAL(10,2),
    "compare_at_price_us" DECIMAL(10,2),
    "included_intl" BOOLEAN,
    "price_intl" DECIMAL(10,2),
    "compare_at_price_intl" DECIMAL(10,2),
    "sourceType" "SourceType" NOT NULL,
    "source_id" TEXT,
    "artwork_artist" TEXT,
    "artwork_medium" TEXT,
    "artwork_height" TEXT,
    "artwork_width" TEXT,
    "artwork_depth" TEXT,
    "artwork_year" TEXT,
    "artwork_status" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "product_id" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "supabase_url" TEXT NOT NULL,
    "supabase_path" TEXT,
    "position" INTEGER NOT NULL,
    "alt_text" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "file_size" INTEGER,
    "format" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_matches" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "artwork_product_id" TEXT NOT NULL,
    "woo_product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "match_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "artwork_sku" TEXT NOT NULL,
    "woo_sku" TEXT NOT NULL,
    "artwork_price" TEXT NOT NULL,
    "woo_price" TEXT NOT NULL,
    "artwork_artist" TEXT NOT NULL,
    "woo_artist" TEXT NOT NULL,
    "dimensions" JSONB,
    "resolution" "DuplicateResolution" NOT NULL DEFAULT 'PENDING',
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,

    CONSTRAINT "duplicate_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_handle_key" ON "products"("handle");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_matches" ADD CONSTRAINT "duplicate_matches_artwork_product_id_fkey" FOREIGN KEY ("artwork_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
