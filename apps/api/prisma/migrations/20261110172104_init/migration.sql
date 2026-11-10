-- CreateTable
CREATE TABLE "Persona" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cedula" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion_cifrada" TEXT NOT NULL,
    "telefono_cifrado" TEXT NOT NULL,
    "creado_en" TEXT NOT NULL,
    "creado_por" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Bloque" (
    "indice" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "persona_id" INTEGER,
    "hash_datos" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "hash_anterior" TEXT NOT NULL,
    "hash_cadena" TEXT NOT NULL,
    "firma_usuario" TEXT,
    "llave_id" INTEGER,
    "creado_en" TEXT NOT NULL,
    CONSTRAINT "Bloque_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "Persona" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Persona_cedula_key" ON "Persona"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "Bloque_persona_id_key" ON "Bloque"("persona_id");
