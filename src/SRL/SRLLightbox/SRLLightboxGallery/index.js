import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useContext
} from 'react'
import PropTypes from 'prop-types'
import { SRLLightboxGalleryStage } from './styles'
import SRLLightboxSlideComponent from './SRLLightboxSlide'
import SRLLightboxControls from './SRLLightboxControls'
import SRLProgressBarComponent from './SRLLightboxSlide/SRLProgressBar'
import { SRLCtx } from '../../SRLContext'
import panzoom from 'panzoom'
import fscreen from 'fscreen'
import { useIdle, useInterval } from 'react-use'
import { useDebouncedCallback } from 'use-debounce'
import subscribe from 'subscribe-event'

// CONSTANTS
const NEXT = 'next'
const PREVIOUS = 'previous'

// Lodash helper
const findIndex = require('lodash/findIndex')

const SRLLightboxGallery = ({
  options,
  callbacks,
  selectedElement,
  elements,
  dispatch
}) => {
  // Context
  const ctx = useContext(SRLCtx)

  // Ref for the Image with the panzoom (we define it here as we need it here, but the ref is inside the SRLLightboxSlide component)
  const SRLPanzoomImageRef = useRef()

  // Ref for the SRLStage
  const SRLStageRef = useRef()

  // Ref for the panzoom instance
  const panZoomController = useRef()

  // Ref for the subscribe
  const unsubscribe = useRef()

  // Destructuring the options
  const {
    // new
    buttons,
    settings,
    progressBar
  } = options

  // Destructuring the callbacks !!!passed by user!!! and we need to check if those are functions
  const {
    onCountSlides,
    onSlideChange,
    onLightboxClosed,
    onLightboxOpened
  } = callbacks

  // Callbacks functions
  const onChange = useCallback(
    (object) => {
      if (typeof onSlideChange === 'function') {
        return ctx.callbacks.onSlideChange(object)
      } else {
        console.error(
          `Simple React Lightbox error: you are not passing a function in your "onSlideChange" callback! You are passing a ${typeof onSlideChange}.`
        )
      }
    },
    [ctx.callbacks, onSlideChange]
  )

  const onOpened = useCallback(
    (current) => {
      if (typeof onLightboxOpened === 'function') {
        ctx.callbacks.onLightboxOpened(current)
      } else {
        console.error(
          `Simple React Lightbox error: you are not passing a function in your "onLightboxOpened" callback! You are passing a ${typeof onLightboxOpened}.`
        )
      }
    },
    [ctx.callbacks, onLightboxOpened]
  )

  const onClosed = useCallback(
    (current) => {
      if (typeof onLightboxClosed === 'function') {
        ctx.callbacks.onLightboxClosed(current)
      } else {
        console.error(
          `Simple React Lightbox error: you are not passing a function in your "onLightboxClosed" callback! You are passing a ${typeof onLightboxClosed}.`
        )
      }
    },
    [ctx.callbacks, onLightboxClosed]
  )

  const onCount = useCallback(
    (total) => {
      if (typeof onCountSlides === 'function') {
        ctx.callbacks.onCountSlides(total)
      } else {
        console.error(
          `Simple React Lightbox error: you are not passing a function in your "onCountSlides" callback! You are passing a ${typeof onCountSlides}.`
        )
      }
    },
    [ctx.callbacks, onCountSlides]
  )

  // In this component we set the state using the context.
  // We don't want to manipulate the context every time so we create a localized state
  // The first element will be the one that is clicked
  const [currentElement, setCurrentElement] = useState(selectedElement)
  // Let's set a state for the "autoplay" option
  const [autoplay, setAutoplay] = useState(false)
  // Let's set a state for the "panzoom" option
  const [panzoomEnabled, setPanzoomEnabled] = useState(false)
  // Establish if the selected slide comes before or after the current slide and save it to this state
  const [direction, setDirection] = useState()

  // Check if the user is not taking any action
  const isIdle = useIdle(
    settings.hideControlsAfter < 1000 ? 9999999 : settings.hideControlsAfter
  )

  // Method to get the index of a slide
  const getElementIndex = useCallback(
    (id) => {
      const elIndex = findIndex(elements, function (el) {
        return el.id === id
      })
      return elIndex
    },
    [elements]
  )

  // Method to establish if we are selecting an element that comes before or after the current one
  const establishNextOrPrevious = useCallback(
    (selectedElementId, currentElementId, knownDirection) => {
      /* Because we can't get the ID of a selected element when clicking on the
      "next" and "previous" button, we pass an hard-coded value called "knownDirection"
      as we know that we are definitely running that particular function (handleNextElement or handlePreviousElement). If we have this value, skip the check all together and immediately set the new direction */
      if (knownDirection) {
        if (knownDirection === NEXT) {
          setDirection(NEXT)
        } else if (knownDirection === PREVIOUS) {
          setDirection(PREVIOUS)
        } else {
          setDirection(undefined)
        }
      } else {
        /* If we are clicking on a thumbnail we can check if the ID of the thumbnail
        that we clicked on is greater o lower than the currentElementID so we can establish if it comes after or before it */
        if (selectedElementId > currentElementId) {
          setDirection(NEXT)
        } else if (selectedElementId < currentElementId) {
          setDirection(PREVIOUS)
        } else {
          setDirection(undefined)
        }
      }
    },
    []
  )

  // Handle Panzoom
  const handlePanzoom = useCallback(
    (value) => {
      if (!settings.disablePanzoom) {
        setPanzoomEnabled(value)
      }
    },
    [settings.disablePanzoom]
  )

  // Set the element, reset the panzoom state and determine direction of the slide
  const setElementAndDirection = useCallback(
    (elementID, currentID, element, knownDirection) => {
      handlePanzoom(false)
      establishNextOrPrevious(elementID, currentID, knownDirection)
      setCurrentElement({ ...element })
    },
    [establishNextOrPrevious, handlePanzoom]
  )

  // Handle Image Download
  function toDataURL(url) {
    return fetch(url)
      .then((response) => {
        return response.blob()
      })
      .then((blob) => {
        return URL.createObjectURL(blob)
      })
  }
  async function handleImageDownload() {
    const a = document.createElement('a')
    a.href = await toDataURL(currentElement.source)
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Handle Current Element
  const handleCurrentElement = useCallback(
    (elementID, currentID) => {
      // Grab the current element index
      const currentElementIndex = getElementIndex(elementID)

      // Grab the current element
      const currentElement = elements[currentElementIndex]

      // Set the state with the new element
      setElementAndDirection(elementID, currentID, currentElement)

      // Callback
      onChange({
        action: 'selected',
        slides: {
          previous: elements[currentElementIndex - 1],
          current: currentElement,
          next: elements[currentElementIndex + 1]
        },
        index: currentElementIndex
      })
    },

    [elements, getElementIndex, onChange, setElementAndDirection]
  )

  // Handle Previous Element
  const handlePrevElement = useCallback(
    (elementID) => {
      // Get the current element index
      const currentElementIndex = getElementIndex(elementID)

      /* The prev element will be the prev item in the array but it could be "undefined" as it goes negative.
      If it does we need to start from the last item. */
      const prevElement =
        elements[currentElementIndex - 1] || elements[elements.length - 1]

      // Set the state with the new element
      setElementAndDirection(elementID, null, prevElement, 'previous')

      // Callback
      const index =
        currentElementIndex - 1 === -1
          ? elements.length - 1
          : currentElementIndex - 1
      onChange({
        action: 'left',
        slides: {
          previous: elements[index - 1],
          current: prevElement,
          next: elements[index + 1]
        },
        index
      })
    },
    [elements, getElementIndex, onChange, setElementAndDirection]
  )

  // Handle Next element
  const handleNextElement = useCallback(
    (elementID) => {
      // Get the current element index
      const currentElementIndex = getElementIndex(elementID)

      /* The next element will be the next item in the array but it could be "undefined".
      If it's undefined we know we have reached the end and we go back to the first item */
      const nextElement = elements[currentElementIndex + 1] || elements[0]

      // Set the state with the new element
      setElementAndDirection(elementID, null, nextElement, 'next')

      // Callback
      const index =
        currentElementIndex + 1 === elements.length
          ? 0
          : currentElementIndex + 1

      onChange({
        action: 'right',
        slides: {
          previous: elements[index - 1],
          current: nextElement,
          next: elements[index + 1]
        },
        index
      })
    },
    [elements, getElementIndex, onChange, setElementAndDirection]
  )

  // Handle Close Lightbox
  const handleCloseLightbox = useCallback(() => {
    dispatch({
      type: 'CLOSE_LIGHTBOX'
    })
    // Callback
    onClosed({
      opened: false,
      currentSlide: ctx.selectedElement
    })
  }, [dispatch, onClosed, ctx.selectedElement])

  // Handle Autoplay
  useInterval(
    () => handleNextElement(currentElement.id),
    autoplay ? settings.autoplaySpeed : null
  )

  // Handle Navigation With Keys
  const [handleNavigationWithKeys] = useDebouncedCallback(
    // function
    (value) => {
      if (value === 'ArrowRight' || value === 'ArrowUp') {
        handleNextElement(currentElement.id)
      }
      if (value === 'ArrowLeft' || value === 'ArrowDown') {
        handlePrevElement(currentElement.id)
      }
      if (value === 'Escape') {
        handleCloseLightbox()
      }
    },
    // delay in ms
    300
  )

  // Handle FullScreen
  function handleFullScreen() {
    // Stops the autoplay
    setAutoplay(false)
    let el = ''
    if (typeof window !== 'undefined') {
      el =
        document.querySelector('.SRLImage') ||
        document.querySelector('.SRLPanzoomImage')
    }

    if (el !== null) {
      if (fscreen.fullscreenEnabled) {
        fscreen.addEventListener('fullscreenchange', null, false)
        fscreen.requestFullscreen(el)
      }
    }
  }

  // Handle Idle Off
  function handleOnActive() {
    if (SRLStageRef.current !== null && SRLStageRef.current !== undefined) {
      if (SRLStageRef.current.classList.contains('SRLIdle')) {
        SRLStageRef.current.classList.remove('SRLIdle')
      }
    }
  }

  // Handle Idle On
  function handleOnIdle() {
    if (SRLStageRef.current !== null && SRLStageRef.current !== undefined) {
      SRLStageRef.current.classList.add('SRLIdle')
    }
  }

  // We want this to run only once!!!
  useEffect(() => {
    onOpened({
      opened: true,
      currentSlide: ctx.selectedElement
    })

    onCount({
      totalSlide: ctx.elements.length
    })
  }, [])

  useEffect(() => {
    // Initialize the Idle functionality
    if (settings.hideControlsAfter !== 0 || !settings.hideControlsAfter) {
      if (isIdle) {
        handleOnIdle()
      } else {
        handleOnActive()
      }
    }

    // Initialize the panzoom functionality
    if (!settings.disablePanzoom) {
      if (panzoomEnabled) {
        const panzoomElementRef = SRLPanzoomImageRef.current
        const INITIAL_ZOOM = 1.5

        panZoomController.current = panzoom(panzoomElementRef, {
          bounds: true,
          maxZoom: 3,
          minZoom: 0.9
        })

        if (panzoomElementRef !== undefined || panzoomElementRef !== null) {
          // Zoom the image
          panZoomController.current.zoomAbs(0, 0, INITIAL_ZOOM)
          panZoomController.current.moveTo(0, 0)
        }
      }
    }

    // Sets the current element to be the first item in the array if the id is undefined. This is crucial in case the user uses the provided method to open the lightbox from a link or a button (using the High Order Component) etc...
    if (currentElement.id === undefined) {
      setCurrentElement({
        source: elements[0].source,
        caption: elements[0].caption,
        id: elements[0].id,
        width: elements[0].width,
        height: elements[0].height
      })
    }

    // EVENT LISTENERS
    if (!settings.disableKeyboardControls) {
      unsubscribe.current = subscribe(
        document,
        'keydown',
        (e) => handleNavigationWithKeys(e.key),
        false
      )
    }

    // Adds a class to the body to remove the overflow
    if (typeof window !== 'undefined') {
      document.body.classList.add('SRLOpened')
      document.body.style.overflow = 'hidden'
    }

    // Cleans up function to remove the class from the body
    return () => {
      document.body.classList.remove('SRLOpened')
      document.body.style.overflow = null
      unsubscribe.current()

      if (panzoomEnabled) {
        // Dispose of the panzoom completely when cleaning up
        panZoomController.current.dispose()
      }
    }
  }, [
    currentElement.id,
    elements,
    settings.disablePanzoom,
    settings.disableKeyboardControls,
    panzoomEnabled,
    settings.hideControlsAfter,
    isIdle,
    handleNavigationWithKeys,
    direction
  ])

  // Light-box controls
  const controls = {
    currentElementID: currentElement.id,
    direction,
    handleCurrentElement,
    handleNextElement,
    handlePrevElement,
    handleCloseLightbox,
    handleFullScreen,
    handleImageDownload,
    handlePanzoom,
    autoplay,
    panzoomEnabled,
    settings,
    buttons,
    setAutoplay,
    SRLPanzoomImageRef
  }

  // Light-box buttons options
  const buttonOptions = {
    buttonsBackgroundColor: buttons.backgroundColor,
    buttonsIconColor: buttons.iconColor,
    buttonsSize: buttons.size,
    buttonsIconPadding: buttons.iconPadding,
    // Offset the buttons from the autoplay progress bar
    buttonsOffsetFromProgressBar: progressBar.height,
    showProgressBar: progressBar.showProgressBar
  }

  return (
    <SRLLightboxGalleryStage
      ref={SRLStageRef}
      overlayColor={settings.overlayColor}
      className="SRLStage"
    >
      {progressBar.showProgressBar && autoplay && (
        <SRLProgressBarComponent
          autoplay={autoplay}
          autoplaySpeed={settings.autoplaySpeed}
          progressBar={progressBar}
        />
      )}
      <SRLLightboxControls {...buttonOptions} {...controls} />
      <SRLLightboxSlideComponent
        {...currentElement}
        {...controls}
        elements={elements}
        options={options}
      />
    </SRLLightboxGalleryStage>
  )
}

SRLLightboxGallery.propTypes = {
  callbacks: PropTypes.object,
  elements: PropTypes.array,
  isOpened: PropTypes.bool,
  dispatch: PropTypes.func,
  selectedElement: PropTypes.object,
  options: PropTypes.shape({
    settings: PropTypes.shape({
      overlayColor: PropTypes.string,
      autoplaySpeed: PropTypes.number,
      disableKeyboardControls: PropTypes.bool,
      disablePanzoom: PropTypes.bool,
      hideControlsAfter: PropTypes.oneOfType([PropTypes.number, PropTypes.bool])
    }),
    buttons: PropTypes.shape({
      backgroundColor: PropTypes.string,
      iconColor: PropTypes.string,
      iconPadding: PropTypes.string,
      size: PropTypes.string
    }),
    progressBar: PropTypes.shape({
      showProgressBar: PropTypes.bool,
      background: PropTypes.string,
      fill: PropTypes.string,
      height: PropTypes.string
    })
  })
}

export default SRLLightboxGallery
