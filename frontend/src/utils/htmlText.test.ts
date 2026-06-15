import { describe, expect, it } from 'vitest'
import { htmlToTextareaText } from '@/utils/htmlText'

describe('htmlToTextareaText', () => {
  it('converts KYC HTML blocks into readable textarea text', () => {
    expect(htmlToTextareaText('<h4>Generated KYC response</h4><ul><li><strong>Source:</strong> OpenAI</li></ul><p>Acme &amp; tkxel<br/>Ready</p>')).toBe(
      'Generated KYC response\n- Source: OpenAI\nAcme & tkxel\nReady',
    )
  })
})
