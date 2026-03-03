import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FaTimes } from 'react-icons/fa';
import './AnimatedModal.css';

const AnimatedModal = ({ isOpen, onClose, title, icon, children, containerClassName = '', overlayClassName = '', bodyClassName = '' }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`modal-overlay ${overlayClassName}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className={`modal-container ${containerClassName}`}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -20 }}
            transition={{ 
              type: "spring",
              damping: 25,
              stiffness: 300,
              duration: 0.3
            }}
          >
            {/* Fixed header at top of modal (outside scroll area) */}
            <div className="modal-header">
              {React.cloneElement(icon, { className: "modal-title-icon" })}
              <h2>{title}</h2>
              <button
                className="modal-close-btn"
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                <FaTimes />
              </button>
            </div>

            {/* Scrollable body below the fixed header */}
            <motion.div
              className={`modal-body ${bodyClassName}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.14, duration: 0.28 }}
            >
              {children}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnimatedModal; 