-- CreateTable
CREATE TABLE "Bitacora" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fecha" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "hash" TEXT NOT NULL
);
