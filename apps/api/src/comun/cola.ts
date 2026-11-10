/** Cola en proceso: ejecuta las tareas de una en una, en el orden en que llegan. */
export class Cola {
  private cola: Promise<unknown> = Promise.resolve();

  ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(tarea);
    // un fallo no debe bloquear las tareas siguientes
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }
}
