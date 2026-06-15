import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ServiceLineMultiSelect } from '@/components/account/ServiceLineMultiSelect'

describe('ServiceLineMultiSelect', () => {
  it('selects catalog services and keeps existing non-catalog selections visible', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <ServiceLineMultiSelect
        label="Service lines"
        selected={['Legacy Service']}
        options={['Development', 'UX Design', 'Mulesoft']}
        onChange={onChange}
      />,
    )

    expect(screen.getByLabelText('Legacy Service')).toBeChecked()
    await user.click(screen.getByLabelText('Development'))

    expect(onChange).toHaveBeenCalledWith(['Legacy Service', 'Development'])
  })

  it('filters catalog options by search text', async () => {
    const user = userEvent.setup()

    render(
      <ServiceLineMultiSelect
        label="Service lines"
        selected={[]}
        options={['Development', 'Cloud Migration Service', 'Mulesoft']}
        onChange={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Search service lines'), 'cloud')

    expect(screen.getByLabelText('Cloud Migration Service')).toBeInTheDocument()
    expect(screen.queryByLabelText('Development')).not.toBeInTheDocument()
  })
})
