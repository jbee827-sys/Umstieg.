import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Ohne das teilen sich aufeinanderfolgende Tests denselben DOM und
// finden Elemente des Vorgängers.
afterEach(() => cleanup())
