// Code snippets for the typing game's "code" mode.
// Each snippet is typed line by line; indentation (2 spaces per level,
// for every language) is shown and auto-filled, so players type only
// the trimmed text of each line. Lines are plain printable ASCII,
// at most 56 characters, 4-10 lines per snippet, 12 per language.

export const CODE = {
  javascript: [
`function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}`,
`const groupBy = (items, keyFn) =>
  items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {});`,
`async function getJSON(url, ms = 5000) {
  const signal = AbortSignal.timeout(ms);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}`,
`function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}`,
`app.get('/api/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(user);
});`,
`class Emitter {
  #map = new Map();
  on(type, fn) {
    const list = this.#map.get(type) ?? [];
    this.#map.set(type, [...list, fn]);
  }
  emit(type, x) {
    for (const fn of this.#map.get(type) ?? []) fn(x);
  }
}`,
`const btn = document.querySelector('#theme');
btn.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme === 'dark';
  root.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('theme', root.dataset.theme);
});`,
`function memoize(fn) {
  const cache = new Map();
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg));
    return cache.get(arg);
  };
}`,
`function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}`,
`function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(i ? 1 : 0) + ' ' + units[i];
}`,
`async function retry(task, tries = 3) {
  for (let n = 1; ; n++) {
    try {
      return await task();
    } catch (err) {
      if (n >= tries) throw err;
      await new Promise((r) => setTimeout(r, n * 250));
    }
  }
}`,
`function topWords(text, n = 3) {
  const counts = new Map();
  for (const w of text.toLowerCase().split(/ +/)) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}`,
  ],

  typescript: [
`type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
function tryParse(json: string): Result<unknown> {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}`,
`interface Point {
  x: number;
  y: number;
}
function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}`,
`function pick<T, K extends keyof T>(obj: T, keys: K[]) {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}`,
`enum Status { Idle, Loading, Done, Failed }
function label(s: Status): string {
  switch (s) {
    case Status.Loading: return 'Loading...';
    case Status.Done: return 'Complete';
    case Status.Failed: return 'Something went wrong';
    default: return 'Ready';
  }
}`,
`class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    const old = this.map.keys().next().value!;
    if (this.map.size > this.max) this.map.delete(old);
  }
}`,
`type Props = { label: string; count: number };
export function Badge({ label, count }: Props) {
  if (count === 0) return null;
  return (
    <span className="badge">
      {label}: {count > 99 ? '99+' : count}
    </span>
  );
}`,
`interface Todo {
  id: number;
  title: string;
  done: boolean;
}
async function loadTodos(): Promise<Todo[]> {
  const res = await fetch('/api/todos');
  if (!res.ok) throw new Error(res.statusText);
  return (await res.json()) as Todo[];
}`,
`type Cat = { kind: 'cat'; meows: boolean };
type Dog = { kind: 'dog'; barks: boolean };
type Pet = Cat | Dog;
function isCat(pet: Pet): pet is Cat {
  return pet.kind === 'cat';
}`,
`type Draft<T> = { -readonly [K in keyof T]?: T[K] };
interface Config {
  readonly host: string;
  readonly port: number;
}
const patch: Draft<Config> = { port: 8080 };`,
`function sumBy<T>(items: T[], fn: (item: T) => number) {
  return items.reduce((sum, x) => sum + fn(x), 0);
}
const cart = [
  { price: 4.5, qty: 2 },
  { price: 12, qty: 1 },
];
const total = sumBy(cart, (i) => i.price * i.qty);`,
`import { Router } from 'express';
const router = Router();
router.post('/login', async (req, res) => {
  const { email, password } = req.body as Credentials;
  const user = await auth.verify(email, password);
  if (!user) return res.sendStatus(401);
  res.json({ token: auth.sign(user.id) });
});
export default router;`,
`const SIZES = ['sm', 'md', 'lg'] as const;
type Size = (typeof SIZES)[number];
function isSize(value: string): value is Size {
  return (SIZES as readonly string[]).includes(value);
}`,
  ],

  python: [
`def chunks(seq, size):
  """Yield successive slices of length size."""
  for i in range(0, len(seq), size):
    yield seq[i:i + size]`,
`from collections import Counter
def top_words(path, n=10):
  with open(path, encoding="utf-8") as f:
    words = f.read().lower().split()
  return Counter(words).most_common(n)`,
`from dataclasses import dataclass, field
@dataclass
class Order:
  id: int
  items: list[str] = field(default_factory=list)
  paid: bool = False
  def total(self, prices: dict[str, float]) -> float:
    return sum(prices[i] for i in self.items)`,
`def bisect_left(a, x):
  lo, hi = 0, len(a)
  while lo < hi:
    mid = (lo + hi) // 2
    if a[mid] < x:
      lo = mid + 1
    else:
      hi = mid
  return lo`,
`from flask import Flask, jsonify, request
app = Flask(__name__)
@app.post("/echo")
def echo():
  data = request.get_json(silent=True) or {}
  return jsonify(received=data, size=len(data))`,
`scores = {"ana": 91, "ben": 78, "cy": 85, "dee": 62}
passed = {k: v for k, v in scores.items() if v >= 80}
ranked = sorted(scores, key=scores.get, reverse=True)
print(f"passed: {len(passed)}, top: {ranked[0]}")`,
`import time
from contextlib import contextmanager
@contextmanager
def timer(label):
  start = time.perf_counter()
  try:
    yield
  finally:
    took = time.perf_counter() - start
    print(f"{label}: {took:.3f}s")`,
`import csv
def load_rows(path):
  with open(path, newline="") as f:
    reader = csv.DictReader(f)
    return [row for row in reader if row["email"]]`,
`from functools import lru_cache
@lru_cache(maxsize=None)
def fib(n: int) -> int:
  if n < 2:
    return n
  return fib(n - 1) + fib(n - 2)`,
`class Temperature:
  def __init__(self, celsius):
    self.celsius = celsius
  @property
  def fahrenheit(self):
    return self.celsius * 9 / 5 + 32
  def __repr__(self):
    return f"Temperature({self.celsius!r})"`,
`import asyncio
async def square(i):
  await asyncio.sleep(0.1 * i)
  return i * i
async def main():
  tasks = [square(i) for i in range(5)]
  print(await asyncio.gather(*tasks))
asyncio.run(main())`,
`from pathlib import Path
def large_files(root, min_mb=50):
  limit = min_mb * 1024 * 1024
  for p in Path(root).rglob("*"):
    if p.is_file() and p.stat().st_size > limit:
      yield p`,
  ],

  java: [
`public static int gcd(int a, int b) {
  while (b != 0) {
    int t = b;
    b = a % b;
    a = t;
  }
  return a;
}`,
`public record Point(double x, double y) {
  public double distanceTo(Point other) {
    double dx = other.x - x, dy = other.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}`,
`Map<String, Long> countByCity = people.stream()
  .filter(p -> p.age() >= 18)
  .collect(Collectors.groupingBy(
    Person::city, Collectors.counting()));`,
`static String reverseWords(String s) {
  String[] parts = s.trim().split(" +");
  Collections.reverse(Arrays.asList(parts));
  return String.join(" ", parts);
}`,
`static List<String> readLines(Path path) {
  try (var reader = Files.newBufferedReader(path)) {
    return reader.lines().map(String::strip).toList();
  } catch (IOException e) {
    throw new UncheckedIOException(e);
  }
}`,
`@RestController
@RequestMapping("/api/books")
public class BookController {
  @Autowired
  private BookRepository repo;
  @GetMapping("/{id}")
  public Book get(@PathVariable long id) {
    return repo.findById(id).orElseThrow();
  }
}`,
`@FunctionalInterface
interface Validator<T> {
  boolean test(T value);
  default Validator<T> and(Validator<T> other) {
    return v -> test(v) && other.test(v);
  }
}`,
`static boolean isPalindrome(String s) {
  int i = 0, j = s.length() - 1;
  while (i < j) {
    if (s.charAt(i++) != s.charAt(j--)) return false;
  }
  return true;
}`,
`enum Coin {
  PENNY(1), NICKEL(5), DIME(10), QUARTER(25);
  final int cents;
  Coin(int cents) {
    this.cents = cents;
  }
}`,
`static int[] twoSum(int[] nums, int target) {
  Map<Integer, Integer> seen = new HashMap<>();
  for (int i = 0; i < nums.length; i++) {
    Integer j = seen.get(target - nums[i]);
    if (j != null) return new int[] { j, i };
    seen.put(nums[i], i);
  }
  return new int[0];
}`,
`String displayName(User user) {
  return Optional.ofNullable(user)
    .map(User::nickname)
    .filter(n -> !n.isBlank())
    .orElse("Guest");
}`,
`static String season(int month) {
  return switch (month) {
    case 12, 1, 2 -> "winter";
    case 3, 4, 5 -> "spring";
    case 6, 7, 8 -> "summer";
    default -> "autumn";
  };
}`,
  ],

  c: [
`size_t my_strlen(const char *s) {
  const char *p = s;
  while (*p)
    p++;
  return (size_t)(p - s);
}`,
`void reverse(int *a, size_t n) {
  for (size_t i = 0; i < n / 2; i++) {
    int tmp = a[i];
    a[i] = a[n - 1 - i];
    a[n - 1 - i] = tmp;
  }
}`,
`struct node { int value; struct node *next; };
struct node *push(struct node *head, int value) {
  struct node *n = malloc(sizeof *n);
  if (!n) return head;
  n->value = value;
  n->next = head;
  return n;
}`,
`#include <stdio.h>
int main(int argc, char **argv) {
  for (int i = 1; i < argc; i++)
    printf("%d: %s\\n", i, argv[i]);
  return 0;
}`,
`unsigned popcount(unsigned x) {
  unsigned count = 0;
  while (x) {
    x &= x - 1;
    count++;
  }
  return count;
}`,
`long count_lines(const char *path) {
  FILE *f = fopen(path, "r");
  if (!f) return -1;
  long lines = 0;
  int c;
  while ((c = fgetc(f)) != EOF)
    if (c == '\\n') lines++;
  fclose(f);
  return lines;
}`,
`static int cmp_int(const void *a, const void *b) {
  int x = *(const int *)a, y = *(const int *)b;
  return (x > y) - (x < y);
}
void sort_ints(int *a, size_t n) {
  qsort(a, n, sizeof *a, cmp_int);
}`,
`#define ARRAY_LEN(a) (sizeof(a) / sizeof((a)[0]))
typedef struct {
  const char *name;
  int score;
} Player;
static Player roster[] = {{"ada", 12}, {"lin", 9}};
size_t roster_size(void) { return ARRAY_LEN(roster); }`,
`#include <ctype.h>
void str_upper(char *s) {
  for (; *s; s++)
    *s = (char)toupper((unsigned char)*s);
}`,
`int bsearch_int(const int *a, int n, int key) {
  int lo = 0, hi = n - 1;
  while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == key) return mid;
    if (a[mid] < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
`void vec_push(IntVec *v, int x) {
  if (v->len == v->cap) {
    v->cap = v->cap ? v->cap * 2 : 8;
    v->data = realloc(v->data, v->cap * sizeof(int));
    if (!v->data) abort();
  }
  v->data[v->len++] = x;
}`,
`enum color { RED, GREEN, BLUE };
const char *color_name(enum color c) {
  switch (c) {
    case RED: return "red";
    case GREEN: return "green";
    case BLUE: return "blue";
  }
  return "unknown";
}`,
  ],

  go: [
`func Reverse(s string) string {
  r := []rune(s)
  for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
    r[i], r[j] = r[j], r[i]
  }
  return string(r)
}`,
`func health(w http.ResponseWriter, r *http.Request) {
  w.Header().Set("Content-Type", "application/json")
  json.NewEncoder(w).Encode(map[string]string{
    "status": "ok",
  })
}`,
`type Stack[T any] []T
func (s *Stack[T]) Push(v T) { *s = append(*s, v) }
func (s *Stack[T]) Pop() T {
  old := *s
  v := old[len(old)-1]
  *s = old[:len(old)-1]
  return v
}`,
`func readConfig(path string) (*Config, error) {
  data, err := os.ReadFile(path)
  if err != nil {
    return nil, fmt.Errorf("read config: %w", err)
  }
  cfg := new(Config)
  err = json.Unmarshal(data, cfg)
  return cfg, err
}`,
`var wg sync.WaitGroup
results := make([]int, len(jobs))
for i, job := range jobs {
  wg.Add(1)
  go func() {
    defer wg.Done()
    results[i] = process(job)
  }()
}
wg.Wait()`,
`func gen(nums ...int) <-chan int {
  out := make(chan int)
  go func() {
    for _, n := range nums {
      out <- n
    }
    close(out)
  }()
  return out
}`,
`func wordCount(text string) map[string]int {
  counts := make(map[string]int)
  for _, w := range strings.Fields(text) {
    counts[strings.ToLower(w)]++
  }
  return counts
}`,
`type Shape interface {
  Area() float64
}
func totalArea(shapes []Shape) float64 {
  sum := 0.0
  for _, s := range shapes {
    sum += s.Area()
  }
  return sum
}`,
`select {
case msg := <-messages:
  fmt.Println("got", msg)
case <-time.After(2 * time.Second):
  fmt.Println("timed out")
}`,
`func main() {
  port := flag.Int("port", 8080, "port to listen on")
  flag.Parse()
  addr := fmt.Sprintf(":%d", *port)
  log.Printf("listening on %s", addr)
  log.Fatal(http.ListenAndServe(addr, nil))
}`,
`sort.Slice(users, func(i, j int) bool {
  if users[i].Age != users[j].Age {
    return users[i].Age < users[j].Age
  }
  return users[i].Name < users[j].Name
})`,
`func TestAdd(t *testing.T) {
  cases := []struct{ a, b, want int }{
    {1, 2, 3}, {0, 0, 0}, {-4, 9, 5},
  }
  for _, c := range cases {
    if got := Add(c.a, c.b); got != c.want {
      t.Errorf("Add(%d, %d) = %d", c.a, c.b, got)
    }
  }
}`,
  ],

  rust: [
`fn max_of<T: PartialOrd + Copy>(xs: &[T]) -> Option<T> {
  let mut best = *xs.first()?;
  for &x in xs {
    if x > best {
      best = x;
    }
  }
  Some(best)
}`,
`#[derive(Debug, Clone, PartialEq)]
struct Vec2 {
  x: f32,
  y: f32,
}
impl Vec2 {
  fn length(&self) -> f32 {
    (self.x * self.x + self.y * self.y).sqrt()
  }
}`,
`enum Command { Move(i32, i32), Say(String), Quit }
fn run(cmd: Command) {
  match cmd {
    Command::Move(x, y) => println!("move to {x},{y}"),
    Command::Say(text) => println!("{text}"),
    Command::Quit => std::process::exit(0),
  }
}`,
`use std::fs;
use std::io;
fn read_number(path: &str) -> io::Result<i64> {
  let text = fs::read_to_string(path)?;
  text.trim().parse().map_err(|e| {
    io::Error::new(io::ErrorKind::InvalidData, e)
  })
}`,
`let total: u32 = orders
  .iter()
  .filter(|o| o.paid)
  .map(|o| o.amount)
  .sum();`,
`use std::collections::HashMap;
fn word_freq(text: &str) -> HashMap<&str, usize> {
  let mut map = HashMap::new();
  for word in text.split_whitespace() {
    *map.entry(word).or_insert(0) += 1;
  }
  map
}`,
`trait Describe {
  fn describe(&self) -> String;
}
impl Describe for bool {
  fn describe(&self) -> String {
    if *self { "yes".into() } else { "no".into() }
  }
}`,
`fn initials(name: &str) -> String {
  name.split(' ')
    .filter_map(|w| w.chars().next())
    .map(|c| c.to_ascii_uppercase())
    .collect()
}`,
`struct Parser<'a> {
  input: &'a str,
  pos: usize,
}
impl<'a> Parser<'a> {
  fn peek(&self) -> Option<char> {
    self.input[self.pos..].chars().next()
  }
}`,
`use std::sync::{Arc, Mutex};
use std::thread;
let counter = Arc::new(Mutex::new(0));
let handles: Vec<_> = (0..4).map(|_| {
  let c = Arc::clone(&counter);
  thread::spawn(move || *c.lock().unwrap() += 1)
}).collect();
for h in handles { h.join().unwrap(); }`,
`use std::fmt;
struct Money(i64);
impl fmt::Display for Money {
  fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
    let (d, c) = (self.0 / 100, self.0 % 100);
    write!(f, "{d}.{c:02} EUR")
  }
}`,
`fn parse_hex(s: &str) -> Option<u32> {
  let digits = s.trim_start_matches("0x");
  u32::from_str_radix(digits, 16).ok()
}
#[test]
fn parses_hex() {
  assert_eq!(parse_hex("0xff"), Some(255));
  assert_eq!(parse_hex("zz"), None);
}`,
  ],

  sql: [
`SELECT department, COUNT(*) AS headcount,
  ROUND(AVG(salary), 2) AS avg_salary
FROM employees
WHERE active = TRUE
GROUP BY department
HAVING COUNT(*) >= 5
ORDER BY avg_salary DESC;`,
`CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`,
`SELECT c.name, o.id, o.total_cents
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY o.created_at DESC
LIMIT 20;`,
`-- customers who never ordered
SELECT c.id, c.email
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;`,
`WITH ranked AS (
  SELECT name, team, points,
    RANK() OVER (
      PARTITION BY team ORDER BY points DESC
    ) AS place
  FROM players
)
SELECT name, team, points
FROM ranked
WHERE place <= 3;`,
`UPDATE products
SET price = price * 0.9
WHERE category_id IN (
  SELECT id FROM categories WHERE name = 'clearance'
);`,
`INSERT INTO page_views (path, day, views)
VALUES ('/home', CURRENT_DATE, 1)
ON CONFLICT (path, day)
DO UPDATE SET views = page_views.views + 1;`,
`CREATE INDEX idx_orders_customer_created
  ON orders (customer_id, created_at DESC);
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE customer_id = 42
ORDER BY created_at DESC LIMIT 10;`,
`SELECT title,
  CASE
    WHEN runtime_min < 90 THEN 'short'
    WHEN runtime_min < 150 THEN 'feature'
    ELSE 'epic'
  END AS length_class
FROM films;`,
`SELECT day, revenue,
  SUM(revenue) OVER (ORDER BY day) AS running_total
FROM daily_sales
WHERE day >= DATE '2025-01-01';`,
`BEGIN;
UPDATE accounts SET balance = balance - 50 WHERE id = 1;
UPDATE accounts SET balance = balance + 50 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount)
VALUES (1, 2, 50);
COMMIT;`,
`CREATE VIEW active_users AS
SELECT u.id, u.name, MAX(s.started_at) AS last_seen
FROM users u
JOIN sessions s ON s.user_id = u.id
GROUP BY u.id, u.name
HAVING MAX(s.started_at) > now() - INTERVAL '30 days';`,
  ],

  html: [
`<nav class="site-nav">
  <a href="/" class="logo">Home</a>
  <ul>
    <li><a href="/blog">Blog</a></li>
    <li><a href="/projects">Projects</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>`,
`.card {
  padding: 1rem 1.25rem;
  border: 1px solid #ddd;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.card:hover {
  transform: translateY(-2px);
}`,
`<form action="/subscribe" method="post">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required>
  <button type="submit">Subscribe</button>
</form>`,
`.gallery {
  display: grid;
  grid-template-columns:
    repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}`,
`.center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}`,
`:root {
  --bg: #fafafa;
  --text: #1a1a1a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121212;
    --text: #eee;
  }
}`,
`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Notes</title>
</head>
<body>
  <main id="app"></main>
</body>
</html>`,
`<table>
  <thead>
    <tr><th>Name</th><th>Score</th></tr>
  </thead>
  <tbody>
    <tr><td>Ada</td><td>98</td></tr>
    <tr><td>Linus</td><td>91</td></tr>
  </tbody>
</table>`,
`.btn {
  background: #2563eb;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  transition: background 0.2s ease;
}
.btn:hover { background: #1d4ed8; }
.btn:focus-visible { outline: 2px solid #93c5fd; }`,
`@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #ccc;
  border-top-color: #333;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}`,
`<details>
  <summary>Show answer</summary>
  <p>The capital of Australia is Canberra.</p>
</details>
<figure>
  <img src="cat.jpg" alt="A cat asleep in a box">
  <figcaption>Monday mood.</figcaption>
</figure>`,
`<header class="top">
  <h1>Dashboard</h1>
</header>
<style>
  .top {
    position: sticky;
    top: 0;
    background: white;
  }
</style>`,
  ],

  bash: [
`#!/usr/bin/env bash
set -euo pipefail
for f in *.png; do
  convert "$f" -resize 50% "small-$f"
done`,
`backup() {
  local src="$1"
  local dest="$HOME/backups/$(date +%F)"
  mkdir -p "$dest"
  tar -czf "$dest/$(basename "$src").tgz" "$src"
}`,
`# delete logs older than a week
find . -name '*.log' -mtime +7 -print0 |
  xargs -0 rm -f
du -sh .`,
`while IFS=, read -r name email; do
  if [[ -z "$email" ]]; then
    echo "skipping $name" >&2
    continue
  fi
  echo "Sending to $email"
done < contacts.csv`,
`case "$1" in
  start) systemctl start myapp ;;
  stop) systemctl stop myapp ;;
  status) systemctl status myapp ;;
  *) echo "usage: $0 {start|stop|status}"; exit 1 ;;
esac`,
`# top committers this week
git log --since="1 week ago" --format='%an' |
  sort |
  uniq -c |
  sort -rn |
  head -5`,
`attempt=0
until curl -fsS http://localhost:8080/health; do
  attempt=$((attempt + 1))
  if (( attempt >= 10 )); then
    echo "service never came up" >&2
    exit 1
  fi
  sleep 2
done`,
`verbose=0
while getopts "vo:" opt; do
  case "$opt" in
    v) verbose=1 ;;
    o) out="$OPTARG" ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))`,
`tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -sL "$URL" -o "$tmp/pkg.tar.gz"
tar -xzf "$tmp/pkg.tar.gz" -C "$tmp"
cp "$tmp"/pkg/bin/* /usr/local/bin/`,
`loc() {
  git ls-files "*.$1" | xargs wc -l | tail -1
}
loc js
loc py`,
`usage=$(df -P / | awk 'NR==2 {print $5}' | tr -d %)
if [ "$usage" -gt 90 ]; then
  echo "Disk at $usage%" | mail -s "disk alert" root
fi`,
`for dir in */; do
  (cd "$dir" && npm ci --silent) &
done
wait
echo "installed deps in all packages"`,
  ],
};

export const CODE_LANGS = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML/CSS' },
  { id: 'bash', label: 'Shell' },
];
