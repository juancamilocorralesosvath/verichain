-- CreateTable
CREATE TABLE "LlaveUsuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuario_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "spki_b64" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "creado_en" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobada_por" INTEGER,
    "aprobada_en" DATETIME,
    CONSTRAINT "LlaveUsuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LlaveUsuario_spki_b64_key" ON "LlaveUsuario"("spki_b64");

-- CreateIndex
CREATE UNIQUE INDEX "LlaveUsuario_usuario_id_version_key" ON "LlaveUsuario"("usuario_id", "version");

-- Una sola llave aprobada por usuario (índice único parcial; Prisma no lo puede declarar en el esquema)
CREATE UNIQUE INDEX "LlaveUsuario_una_aprobada_por_usuario" ON "LlaveUsuario"("usuario_id") WHERE "estado" = 'aprobada';
