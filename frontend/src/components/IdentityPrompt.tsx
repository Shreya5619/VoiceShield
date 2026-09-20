import React from 'react'
import type { FamilyContact } from '../hooks/useFamilyContacts'
import '../styles/IdentityPrompt.css'

export interface IdentityPromptProps {
  /** Enrolled contacts (only those with a speakerEmbedding). Parent supplies the filtered list. */
  enrolledContacts: FamilyContact[]
  /** Called when the user selects the contact the caller claims to be → identify + verifyAgainst. */
  onSelect: (contact: FamilyContact) => void
  /** Called when the user declines voice comparison → VerificationState 'skipped'. */
  onSkip: () => void
}

/**
 * IdentityPrompt — shown when suspicion is crossed on an unknown call
 * (EscalationStage === 'suspect'). Asks the user which enrolled contact the
 * caller claims to be, and always offers an explicit Skip verification control.
 *
 * This component is presentational: it renders exactly the enrolled contacts it
 * is given (the parent filters to contacts with a speakerEmbedding) plus Skip.
 */
export const IdentityPrompt: React.FC<IdentityPromptProps> = ({
  enrolledContacts,
  onSelect,
  onSkip,
}) => {
  const headingId = 'identity-prompt-title'
  const descriptionId = 'identity-prompt-description'

  return (
    <div
      className="identity-prompt-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
    >
      <div className="identity-prompt-content">
        <div className="identity-prompt-icon" aria-hidden="true">
          ⚠️
        </div>

        <h2 id={headingId} className="identity-prompt-title">
          Who does this caller claim to be?
        </h2>

        <p id={descriptionId} className="identity-prompt-description">
          Possible impersonation. Select the contact this caller says they are to
          verify their voice, or skip verification to keep monitoring the call.
        </p>

        {enrolledContacts.length > 0 ? (
          <ul className="identity-prompt-list" aria-label="Enrolled contacts">
            {enrolledContacts.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  className="identity-prompt-contact"
                  onClick={() => onSelect(contact)}
                  aria-label={`Verify caller as ${contact.name}${
                    contact.relation ? `, ${contact.relation}` : ''
                  }`}
                >
                  <span className="identity-prompt-avatar" aria-hidden="true">
                    {contact.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="identity-prompt-contact-info">
                    <span className="identity-prompt-contact-name">{contact.name}</span>
                    {contact.relation && (
                      <span className="identity-prompt-contact-relation">
                        {contact.relation}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="identity-prompt-empty">
            No enrolled contacts are available to verify against.
          </p>
        )}

        <button
          type="button"
          className="identity-prompt-skip"
          onClick={onSkip}
          aria-label="Skip verification and continue the call"
        >
          Skip verification
        </button>
      </div>
    </div>
  )
}

export default IdentityPrompt
