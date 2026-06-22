export interface BM25Document {
  id: string
  text: string
}

export class BM25 {
  private readonly k1 = 1.5
  private readonly b = 0.75
  private idf = new Map<string, number>()
  private docTermFreqs: Array<Map<string, number>> = []
  private docLengths: number[] = []
  private avgDocLen = 0

  constructor(private readonly docs: BM25Document[]) {
    this.build()
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().match(/\b\w{2,}\b/g) ?? []
  }

  private build() {
    const df = new Map<string, number>()

    for (const doc of this.docs) {
      const tokens = this.tokenize(doc.text)
      const tf = new Map<string, number>()
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
      this.docTermFreqs.push(tf)
      this.docLengths.push(tokens.length)
      for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
    }

    const N = this.docs.length
    this.avgDocLen = this.docLengths.reduce((a, b) => a + b, 0) / (N || 1)

    for (const [term, freq] of df) {
      this.idf.set(term, Math.log((N - freq + 0.5) / (freq + 0.5) + 1))
    }
  }

  rank(query: string): Array<{ id: string; score: number }> {
    const terms = this.tokenize(query)
    if (terms.length === 0) return []

    return this.docs
      .map((doc, i) => {
        const tf = this.docTermFreqs[i]
        const docLen = this.docLengths[i]
        let score = 0

        for (const term of terms) {
          const termFreq = tf.get(term) ?? 0
          if (termFreq === 0) continue
          const idf = this.idf.get(term) ?? 0
          score +=
            (idf * (termFreq * (this.k1 + 1))) /
            (termFreq + this.k1 * (1 - this.b + (this.b * docLen) / this.avgDocLen))
        }

        return { id: doc.id, score }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
  }
}
