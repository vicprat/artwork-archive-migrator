/*
  Warnings:

  - A unique constraint covering the columns `[handle]` on the table `products` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "products_handle_key" ON "products"("handle");
