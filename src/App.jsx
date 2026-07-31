import { useEffect, useRef, useState } from 'react';
import './index.css';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_SECONDARY_IMAGES = 3;

const EMPTY_FORM = {
  teamName: '',
  email: '',
  instagram: '',
  mainImage: null,
  secondaryImages: [],
  rulesFile: null,
};

// Identifies a File well enough to key a list row and to spot duplicates.
const fileKey = (file) => `${file.name}-${file.size}-${file.lastModified}`;

export default function App() {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const resetTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const setError = (name, message) =>
    setErrors(prev => ({ ...prev, [name]: message }));

  // Handle text inputs
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setError(name, '');
    }
  };

  // Handle main image
  const handleMainImageChange = (e) => {
    const file = e.target.files?.[0];
    // Always clear the input so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('mainImage', 'Only image files are allowed');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('mainImage', 'Image must be under 5MB');
      return;
    }
    setFormData(prev => ({ ...prev, mainImage: file }));
    setError('mainImage', '');
  };

  // Handle secondary images (up to 3)
  const handleSecondaryImagesChange = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const existing = new Set(formData.secondaryImages.map(fileKey));
    const remaining = MAX_SECONDARY_IMAGES - formData.secondaryImages.length;
    const accepted = [];
    const rejected = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        rejected.push(`${file.name} is not an image`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        rejected.push(`${file.name} is over 5MB`);
      } else if (existing.has(fileKey(file))) {
        rejected.push(`${file.name} was already added`);
      } else if (accepted.length >= remaining) {
        rejected.push(`${file.name} exceeds the ${MAX_SECONDARY_IMAGES}-image limit`);
      } else {
        existing.add(fileKey(file));
        accepted.push(file);
      }
    }

    if (accepted.length > 0) {
      setFormData(prev => ({
        ...prev,
        secondaryImages: [...prev.secondaryImages, ...accepted]
      }));
    }
    setError('secondaryImages', rejected.join('; '));
  };

  // Remove secondary image
  const removeSecondaryImage = (index) => {
    setFormData(prev => ({
      ...prev,
      secondaryImages: prev.secondaryImages.filter((_, i) => i !== index)
    }));
    // Freeing a slot invalidates any "limit reached" message.
    setError('secondaryImages', '');
  };

  // Handle rules file
  const handleRulesFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('rulesFile', 'Only PDF files allowed');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('rulesFile', 'PDF must be under 10MB');
      return;
    }
    setFormData(prev => ({ ...prev, rulesFile: file }));
    setError('rulesFile', '');
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};

    if (!formData.teamName.trim()) {
      newErrors.teamName = 'Team name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (formData.instagram.trim()) {
      try {
        const url = new URL(formData.instagram.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          newErrors.instagram = 'Link must start with http:// or https://';
        }
      } catch {
        newErrors.instagram = 'Enter a valid URL (e.g. https://instagram.com/your-team)';
      }
    }
    if (!formData.mainImage) {
      newErrors.mainImage = 'Main image is required';
    }
    if (formData.secondaryImages.length === 0) {
      newErrors.secondaryImages = 'At least 1 secondary image is required';
    }
    if (!formData.rulesFile) {
      newErrors.rulesFile = 'Rules PDF is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading || !validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // TODO: This will be connected to Airtable in Part 2
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSubmitted(true);

      // Reset form after 3 seconds
      resetTimerRef.current = setTimeout(() => {
        setFormData(EMPTY_FORM);
        setErrors({});
        setSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error('Submission error:', error);
      setError('submit', 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Shared classes for the text inputs.
  const inputClass = (hasError) =>
    `w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
      hasError ? 'border-red-500' : 'border-gray-300'
    }`;

  // Dashed upload box: the label is the box, so the whole area is clickable.
  const dropZoneClass =
    'block border-2 border-dashed border-gray-300 rounded-lg p-6 text-center ' +
    'hover:border-purple-500 focus-within:border-purple-500 focus-within:ring-2 ' +
    'focus-within:ring-purple-500 cursor-pointer transition';

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center" role="status">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Success!</h2>
          <p className="text-gray-600 mb-4">
            Your game upload has been submitted. You'll receive a verification email shortly with your confirmation code.
          </p>
          <p className="text-sm text-gray-500">
            Our admin team will review your submission and contact you within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">iGEM Game Gallery</h1>
          <p className="text-lg text-gray-600">
            Upload your iGEM team's game to share with the community
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* noValidate: this form reports its own errors, so the browser's
              native bubbles must not pre-empt them. */}
          <form onSubmit={handleSubmit} noValidate className="space-y-6">

            {/* Team Name */}
            <div>
              <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2">
                Team Name *
              </label>
              <input
                type="text"
                id="teamName"
                name="teamName"
                value={formData.teamName}
                onChange={handleInputChange}
                placeholder="e.g., MIT iGEM 2024"
                aria-invalid={Boolean(errors.teamName)}
                aria-describedby={errors.teamName ? 'teamName-error' : undefined}
                className={inputClass(errors.teamName)}
              />
              {errors.teamName && (
                <p id="teamName-error" role="alert" className="text-red-500 text-sm mt-1">{errors.teamName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="your@email.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={inputClass(errors.email)}
              />
              {errors.email && (
                <p id="email-error" role="alert" className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            {/* Instagram */}
            <div>
              <label htmlFor="instagram" className="block text-sm font-medium text-gray-700 mb-2">
                Instagram Link (Optional)
              </label>
              <input
                type="url"
                id="instagram"
                name="instagram"
                value={formData.instagram}
                onChange={handleInputChange}
                placeholder="https://instagram.com/your-team"
                aria-invalid={Boolean(errors.instagram)}
                aria-describedby={errors.instagram ? 'instagram-error' : 'instagram-hint'}
                className={inputClass(errors.instagram)}
              />
              {errors.instagram ? (
                <p id="instagram-error" role="alert" className="text-red-500 text-sm mt-1">{errors.instagram}</p>
              ) : (
                <p id="instagram-hint" className="text-gray-500 text-xs mt-1">
                  Helps us verify your team's authenticity
                </p>
              )}
            </div>

            {/* Main Image */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">
                Main Game Image *
              </span>
              <label htmlFor="mainImage" className={dropZoneClass}>
                {/* sr-only rather than hidden: display:none would make the
                    input unreachable by keyboard. */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMainImageChange}
                  className="sr-only"
                  id="mainImage"
                  aria-invalid={Boolean(errors.mainImage)}
                  aria-describedby={errors.mainImage ? 'mainImage-error' : undefined}
                />
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-8-8h-8m0 0V4m0 8v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="block text-gray-600">Click to upload</span>
                <span className="block text-gray-500 text-xs">PNG, JPG up to 5MB</span>
              </label>
              {formData.mainImage && (
                <p className="text-green-600 text-sm mt-2">✓ {formData.mainImage.name}</p>
              )}
              {errors.mainImage && (
                <p id="mainImage-error" role="alert" className="text-red-500 text-sm mt-1">{errors.mainImage}</p>
              )}
            </div>

            {/* Secondary Images */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">
                Additional Images ({formData.secondaryImages.length}/{MAX_SECONDARY_IMAGES}) *
              </span>
              <label htmlFor="secondaryImages" className={dropZoneClass}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleSecondaryImagesChange}
                  className="sr-only"
                  id="secondaryImages"
                  aria-invalid={Boolean(errors.secondaryImages)}
                  aria-describedby={errors.secondaryImages ? 'secondaryImages-error' : undefined}
                />
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-8-8h-8m0 0V4m0 8v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="block text-gray-600">
                  Click to upload up to {MAX_SECONDARY_IMAGES} images
                </span>
                <span className="block text-gray-500 text-xs">PNG, JPG up to 5MB each</span>
              </label>
              {formData.secondaryImages.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {formData.secondaryImages.map((file, index) => (
                    <li key={fileKey(file)} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm text-gray-600">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeSecondaryImage(index)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Remove<span className="sr-only"> {file.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {errors.secondaryImages && (
                <p id="secondaryImages-error" role="alert" className="text-red-500 text-sm mt-1">{errors.secondaryImages}</p>
              )}
            </div>

            {/* Rules PDF */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">
                Game Rules (PDF) *
              </span>
              <label htmlFor="rulesFile" className={dropZoneClass}>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleRulesFileChange}
                  className="sr-only"
                  id="rulesFile"
                  aria-invalid={Boolean(errors.rulesFile)}
                  aria-describedby={errors.rulesFile ? 'rulesFile-error' : undefined}
                />
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M8 8h32v32H8z" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 16h32M8 24h32M8 32h32" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="block text-gray-600">Click to upload PDF</span>
                <span className="block text-gray-500 text-xs">PDF up to 10MB</span>
              </label>
              {formData.rulesFile && (
                <p className="text-green-600 text-sm mt-2">✓ {formData.rulesFile.name}</p>
              )}
              {errors.rulesFile && (
                <p id="rulesFile-error" role="alert" className="text-red-500 text-sm mt-1">{errors.rulesFile}</p>
              )}
            </div>

            {/* Submit Error */}
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
                <p className="text-red-700 text-sm">{errors.submit}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Game Upload'}
            </button>

            <p className="text-gray-500 text-xs text-center">
              * Required fields. You'll receive a verification email shortly.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
