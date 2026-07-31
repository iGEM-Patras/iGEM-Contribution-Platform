import { useState } from 'react';
import './index.css';

export default function App() {
  const [formData, setFormData] = useState({
    teamName: '',
    email: '',
    instagram: '',
    mainImage: null,
    secondaryImages: [],
    rulesFile: null,
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Handle text inputs
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Handle main image
  const handleMainImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({
          ...prev,
          mainImage: 'Image must be under 5MB'
        }));
        return;
      }
      setFormData(prev => ({
        ...prev,
        mainImage: file
      }));
      setErrors(prev => ({
        ...prev,
        mainImage: ''
      }));
    }
  };

  // Handle secondary images (up to 3)
  const handleSecondaryImagesChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length + formData.secondaryImages.length > 3) {
      setErrors(prev => ({
        ...prev,
        secondaryImages: 'Maximum 3 secondary images allowed'
      }));
      return;
    }

    const validFiles = [];
    for (let file of files) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({
          ...prev,
          secondaryImages: 'Each image must be under 5MB'
        }));
        return;
      }
      validFiles.push(file);
    }

    setFormData(prev => ({
      ...prev,
      secondaryImages: [...prev.secondaryImages, ...validFiles]
    }));
    setErrors(prev => ({
      ...prev,
      secondaryImages: ''
    }));
  };

  // Remove secondary image
  const removeSecondaryImage = (index) => {
    setFormData(prev => ({
      ...prev,
      secondaryImages: prev.secondaryImages.filter((_, i) => i !== index)
    }));
  };

  // Handle rules file
  const handleRulesFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setErrors(prev => ({
          ...prev,
          rulesFile: 'PDF must be under 10MB'
        }));
        return;
      }
      if (file.type !== 'application/pdf') {
        setErrors(prev => ({
          ...prev,
          rulesFile: 'Only PDF files allowed'
        }));
        return;
      }
      setFormData(prev => ({
        ...prev,
        rulesFile: file
      }));
      setErrors(prev => ({
        ...prev,
        rulesFile: ''
      }));
    }
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

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // TODO: This will be connected to Airtable in Part 2
      // For now, just simulate success
      console.log('Form data:', formData);
      
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSubmitted(true);
      
      // Reset form after 3 seconds
      setTimeout(() => {
        setFormData({
          teamName: '',
          email: '',
          instagram: '',
          mainImage: null,
          secondaryImages: [],
          rulesFile: null,
        });
        setSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error('Submission error:', error);
      setErrors(prev => ({
        ...prev,
        submit: 'Failed to submit. Please try again.'
      }));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Team Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Team Name *
              </label>
              <input
                type="text"
                name="teamName"
                value={formData.teamName}
                onChange={handleInputChange}
                placeholder="e.g., MIT iGEM 2024"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  errors.teamName ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.teamName && (
                <p className="text-red-500 text-sm mt-1">{errors.teamName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="your@email.com"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            {/* Instagram */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instagram Link (Optional)
              </label>
              <input
                type="url"
                name="instagram"
                value={formData.instagram}
                onChange={handleInputChange}
                placeholder="https://instagram.com/your-team"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-gray-500 text-xs mt-1">
                Helps us verify your team's authenticity
              </p>
            </div>

            {/* Main Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Main Game Image *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-500 cursor-pointer transition">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMainImageChange}
                  className="hidden"
                  id="mainImage"
                />
                <label htmlFor="mainImage" className="cursor-pointer">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-8-8h-8m0 0V4m0 8v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-gray-600">Click to upload or drag and drop</p>
                  <p className="text-gray-500 text-xs">PNG, JPG up to 5MB</p>
                </label>
              </div>
              {formData.mainImage && (
                <p className="text-green-600 text-sm mt-2">✓ {formData.mainImage.name}</p>
              )}
              {errors.mainImage && (
                <p className="text-red-500 text-sm mt-1">{errors.mainImage}</p>
              )}
            </div>

            {/* Secondary Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Images ({formData.secondaryImages.length}/3) *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-500 cursor-pointer transition">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleSecondaryImagesChange}
                  className="hidden"
                  id="secondaryImages"
                />
                <label htmlFor="secondaryImages" className="cursor-pointer">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-8-8h-8m0 0V4m0 8v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-gray-600">Click to upload up to 3 images</p>
                  <p className="text-gray-500 text-xs">PNG, JPG up to 5MB each</p>
                </label>
              </div>
              {formData.secondaryImages.length > 0 && (
                <div className="mt-4 space-y-2">
                  {formData.secondaryImages.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm text-gray-600">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeSecondaryImage(index)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {errors.secondaryImages && (
                <p className="text-red-500 text-sm mt-1">{errors.secondaryImages}</p>
              )}
            </div>

            {/* Rules PDF */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Rules (PDF) *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-500 cursor-pointer transition">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleRulesFileChange}
                  className="hidden"
                  id="rulesFile"
                />
                <label htmlFor="rulesFile" className="cursor-pointer">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M8 8h32v32H8z" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 16h32M8 24h32M8 32h32" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-gray-600">Click to upload PDF</p>
                  <p className="text-gray-500 text-xs">PDF up to 10MB</p>
                </label>
              </div>
              {formData.rulesFile && (
                <p className="text-green-600 text-sm mt-2">✓ {formData.rulesFile.name}</p>
              )}
              {errors.rulesFile && (
                <p className="text-red-500 text-sm mt-1">{errors.rulesFile}</p>
              )}
            </div>

            {/* Submit Error */}
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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