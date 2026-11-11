-- CreateTable
CREATE TABLE "Borrador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuario_id" INTEGER NOT NULL,
    "fila_json" TEXT NOT NULL,
    "hash_datos" TEXT NOT NULL,
    "expira_en" DATETIME NOT NULL,
    CONSTRAINT "Borrador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
