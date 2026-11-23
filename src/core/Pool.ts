// src/core/Pool.ts — pool objek generik (tanpa alokasi di hot loop)
export class Pool<T> {
  readonly items: T[] = [];
  private next = 0;

  constructor(size: number, factory: (i: number) => T) {
    for (let i = 0; i < size; i++) this.items.push(factory(i));
  }

  /** Ambil item berikutnya secara round-robin (FIFO: yang tertua dipakai ulang). */
  acquire(): T {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    return it;
  }

  get size() { return this.items.length; }
}
