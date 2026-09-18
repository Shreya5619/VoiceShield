import { useState, useCallback } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import TranscriptionPage from './components/TranscriptionPage'
import useTranscription from './hooks/useTranscription'
import './App.css'

function App() {
  const {
    isRecording,
    isTranscribing,
    connectionState,
    segments,
    currentPartial,
    error,
    startRecording,
    stopRecording,
  } = useTranscription({
    languageCode: 'en-US',
    region: 'us-east-1',
  })

  return (
    <ErrorBoundary>
      <TranscriptionPage
        connectionState={connectionState}
        connectionError={error}
        isTranscribing={isTranscribing}
        segments={segments}
        currentPartialResult={currentPartial}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        isRecording={isRecording}
      />
    </ErrorBoundary>
  )
}

export default App
