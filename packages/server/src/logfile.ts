import fs from 'node:fs';
import path from 'node:path';

export const LOG_FILE = 'gms.log';
export const LOG_KEEP_DAYS = 14;

const ROTATED_RE = /^gms-(\d{4}-\d{2}-\d{2})\.log$/u;

/** Helyi idő szerinti dátum (ÉÉÉÉ-HH-NN). */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Naponta forgatott naplófájl (technikai spec 9.1): az aktuális nap a `gms.log`-ba
 * kerül, napváltáskor az előző nap `gms-ÉÉÉÉ-HH-NN.log` nevet kap, a 14 napnál
 * régebbi fájlok törlődnek. A pino `stream` opciójaként használható.
 */
export class DailyLogFile {
  private fd: number;
  private day: string;
  readonly file: string;

  constructor(
    readonly dir: string,
    private readonly now: () => Date = () => new Date(),
    private readonly keepDays = LOG_KEEP_DAYS,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, LOG_FILE);
    // Ha a meglévő gms.log egy korábbi napról maradt (a Mac aludt vagy ki volt kapcsolva),
    // először azt forgatjuk el.
    const today = localDay(this.now());
    if (fs.existsSync(this.file)) {
      const fileDay = localDay(fs.statSync(this.file).mtime);
      if (fileDay !== today) this.archive(fileDay);
    }
    this.day = today;
    this.fd = fs.openSync(this.file, 'a');
    this.prune();
  }

  write(chunk: string | Uint8Array): boolean {
    const today = localDay(this.now());
    if (today !== this.day) {
      fs.closeSync(this.fd);
      this.archive(this.day);
      this.day = today;
      this.fd = fs.openSync(this.file, 'a');
      this.prune();
    }
    if (typeof chunk === 'string') fs.writeSync(this.fd, chunk);
    else fs.writeSync(this.fd, chunk);
    return true;
  }

  close(): void {
    fs.closeSync(this.fd);
  }

  private archive(day: string): void {
    const target = path.join(this.dir, `gms-${day}.log`);
    if (fs.existsSync(target)) {
      // Ugyanarra a napra már van archív fájl: hozzáfűzzük, nem írjuk felül.
      fs.appendFileSync(target, fs.readFileSync(this.file));
      fs.rmSync(this.file);
    } else {
      fs.renameSync(this.file, target);
    }
  }

  /** A `keepDays` napnál régebbi archív naplók törlése. */
  private prune(): void {
    const limit = new Date(this.now());
    limit.setDate(limit.getDate() - this.keepDays);
    const oldest = localDay(limit);
    for (const name of fs.readdirSync(this.dir)) {
      const m = ROTATED_RE.exec(name);
      if (m && m[1]! < oldest) fs.rmSync(path.join(this.dir, name), { force: true });
    }
  }
}
