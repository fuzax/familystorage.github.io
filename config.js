(() => {
    const pathPrefix = window.location.hostname.endsWith("github.io") && window.location.pathname.startsWith("/familystorage-")
        ? "/familystorage-"
        : "";
    window.FAMILYDRIVE_BASE_PATH = pathPrefix;
    window.FAMILYDRIVE_API_URL = window.location.hostname.endsWith("github.io")
        ? "fuzax.github.io"
        : "";

    window.familyDriveUrl = (path) => `${window.FAMILYDRIVE_API_URL}${path}`;
})();
