// loaders.gl, MIT license

/* eslint-disable camelcase */

import type {ImageType} from '@loaders.gl/images';
import {ImageLoader} from '@loaders.gl/images';
import {mergeLoaderOptions} from '@loaders.gl/loader-utils';

import type {ImageSourceMetadata, GetImageParameters} from '../../sources/image-source';
import type {ImageSourceProps} from '../../sources/image-source';
import {ImageSource} from '../../sources/image-source';

import type {WMSCapabilities} from '../../../wms-capabilities-loader';
import type {WMSFeatureInfo} from '../../../wip/wms-feature-info-loader';
import type {WMSLayerDescription} from '../../../wip/wms-layer-description-loader';

import {WMSCapabilitiesLoader} from '../../../wms-capabilities-loader';
import {WMSFeatureInfoLoader} from '../../../wip/wms-feature-info-loader';
import {WMSLayerDescriptionLoader} from '../../../wip/wms-layer-description-loader';

import type {WMSLoaderOptions} from '../../../wms-error-loader';
import {WMSErrorLoader} from '../../../wms-error-loader';

/** Static WMS parameters (not viewport or selected pixel dependent) that can be provided as defaults */
export type WMSParameters = {
  /** WMS version */
  version?: '1.3.0' | '1.1.1';
  /** Layers to render */
  layers?: string[];
  /** Coordinate Reference System (CRS) for the image (not the bounding box) */
  crs?: string;
  /** Requested format for the return image */
  format?: 'image/png';
  /** Requested MIME type of returned feature info */
  info_format?: 'text/plain' | 'application/geojson' | 'application/vnd.ogc.gml';
  /** Styling - Not yet supported */
  styles?: unknown;
  /** Any additional parameters specific to this WMSService */
  transparent?: boolean;
};

type WMSCommonParameters = {
  /** In case the endpoint supports multiple WMS versions */
  version?: '1.3.0' | '1.1.1';
};

/** Parameters for GetCapabilities */
export type WMSGetCapabilitiesParameters = WMSCommonParameters;

/** Parameters for GetMap */
export type WMSGetMapParameters = WMSCommonParameters & {
  /** Layers to render */
  layers: string | string[];
  /** bounding box of the requested map image */
  bbox: [number, number, number, number];
  /** pixel width of returned image */
  width: number;
  /** pixels */
  height: number;
  /** Coordinate Reference System for the image (not the bounding box). */
  crs?: string;
  /** Styling */
  styles?: unknown;
  /** Don't render background when no data */
  transparent?: boolean;
  /** requested format for the return image */
  format?: 'image/png';
};

/**
 * Parameters for GetFeatureInfo
 * @see https://imagery.pasda.psu.edu/arcgis/services/pasda/UrbanTreeCanopy_Landcover/MapServer/WmsServer?SERVICE=WMS&
 */
export type WMSGetFeatureInfoParameters = WMSCommonParameters & {
  /** x coordinate for the feature info request */
  x: number;
  /** y coordinate for the feature info request */
  y: number;
  /** list of layers to query (could be different from rendered layers) */
  query_layers: string[];
  /** Requested MIME type of returned feature info */
  info_format?: 'text/plain' | 'application/geojson' | 'application/vnd.ogc.gml';

  /** Layers to render */
  layers: string[];
  /** Styling */
  styles?: unknown;
  /** bounding box of the requested map image */
  bbox: [number, number, number, number];
  /** pixel width of returned image */
  width: number;
  /** pixels */
  height: number;
  /** srs for the image (not the bounding box) */
  srs?: string;
  /** requested format for the return image */
  format?: 'image/png';
};

/** Parameters for DescribeLayer */
export type WMSDescribeLayerParameters = WMSCommonParameters;

/** Parameters for GetLegendGraphic */
export type WMSGetLegendGraphicParameters = WMSCommonParameters;

//

/** Properties for creating a enw WMS service */
export type WMSServiceProps = ImageSourceProps & {
  /** Base URL to the service */
  url: string;
  /** Default WMS parameters. If not provided here, must be provided in the various request */
  wmsParameters?: WMSParameters;
  /** Any additional service specific parameters */
  vendorParameters?: Record<string, unknown>;
};

/**
 * The WMSService class provides
 * - provides type safe methods to form URLs to a WMS service
 * - provides type safe methods to query and parse results (and errors) from a WMS service
 * - implements the ImageService interface
 * @note Only the URL parameter conversion is supported. XML posts are not supported.
 */
export class WMSService extends ImageSource {
  static type: 'wms' = 'wms';
  static testURL = (url: string): boolean => url.toLowerCase().includes('wms');

  readonly url: string;
  /** Default static WMS parameters */
  wmsParameters: Required<WMSParameters>;
  /** Default static vendor parameters */
  vendorParameters?: Record<string, unknown>;

  capabilities: WMSCapabilities | null = null;

  /** A list of loaders used by the WMSService methods */
  readonly loaders = [
    ImageLoader,
    WMSErrorLoader,
    WMSCapabilitiesLoader,
    WMSFeatureInfoLoader,
    WMSLayerDescriptionLoader
  ];

  /** Create a WMSService */
  constructor(props: WMSServiceProps) {
    super(props);

    // TODO - defaults such as version, layers etc could be extracted from a base URL with parameters
    // This would make pasting in any WMS URL more likely to make this class just work.
    // const {baseUrl, parameters} = this._parseWMSUrl(props.url);

    this.url = props.url;

    this.wmsParameters = {
      layers: undefined!,
      styles: undefined,
      version: '1.3.0',
      crs: 'EPSG:4326',
      format: 'image/png',
      info_format: 'text/plain',
      transparent: undefined!,
      ...props.wmsParameters
    };

    this.vendorParameters = props.vendorParameters || {};
  }

  // ImageSource implementation
  async getMetadata(): Promise<ImageSourceMetadata> {
    const capabilities = await this.getCapabilities();
    return this.normalizeMetadata(capabilities);
  }

  async getImage(parameters: GetImageParameters): Promise<ImageType> {
    // WMS 1.3.0 renamed SRS to CRS (sigh...)
    const wmsParameters = {...parameters, crs: parameters.srs};
    delete wmsParameters.srs;
    return await this.getMap(wmsParameters);
  }

  normalizeMetadata(capabilities: WMSCapabilities): ImageSourceMetadata {
    return capabilities;
  }

  // WMS Service API Stubs

  /** Get Capabilities */
  async getCapabilities(
    wmsParameters?: WMSGetCapabilitiesParameters,
    vendorParameters?: Record<string, unknown>
  ): Promise<WMSCapabilities> {
    const url = this.getCapabilitiesURL(wmsParameters, vendorParameters);
    const response = await this.fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._checkResponse(response, arrayBuffer);
    const capabilities = await WMSCapabilitiesLoader.parse(arrayBuffer, this.loadOptions);
    this.capabilities = capabilities;
    return capabilities;
  }

  /** Get a map image */
  async getMap(
    wmsParameters: WMSGetMapParameters,
    vendorParameters?: Record<string, unknown>
  ): Promise<ImageType> {
    const url = this.getMapURL(wmsParameters, vendorParameters);
    const response = await this.fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._checkResponse(response, arrayBuffer);
    try {
      return await ImageLoader.parse(arrayBuffer, this.loadOptions);
    } catch {
      throw this._parseError(arrayBuffer);
    }
  }

  /** Get Feature Info for a coordinate */
  async getFeatureInfo(
    wmsParameters: WMSGetFeatureInfoParameters,
    vendorParameters?: Record<string, unknown>
  ): Promise<WMSFeatureInfo> {
    const url = this.getFeatureInfoURL(wmsParameters, vendorParameters);
    const response = await this.fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._checkResponse(response, arrayBuffer);
    return await WMSFeatureInfoLoader.parse(arrayBuffer, this.loadOptions);
  }

  /** Get Feature Info for a coordinate */
  async getFeatureInfoText(
    wmsParameters: WMSGetFeatureInfoParameters,
    vendorParameters?: Record<string, unknown>
  ): Promise<string> {
    const url = this.getFeatureInfoURL(wmsParameters, vendorParameters);
    const response = await this.fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._checkResponse(response, arrayBuffer);
    return new TextDecoder().decode(arrayBuffer);
  }

  /** Get more information about a layer */
  async describeLayer(
    wmsParameters: WMSDescribeLayerParameters,
    vendorParameters?: Record<string, unknown>
  ): Promise<WMSLayerDescription> {
    const url = this.describeLayerURL(wmsParameters, vendorParameters);
    const response = await this.fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._checkResponse(response, arrayBuffer);
    return await WMSLayerDescriptionLoader.parse(arrayBuffer, this.loadOptions);
  }

  /** Get an image with a semantic legend */
  async getLegendGraphic(
    wmsParameters: WMSGetLegendGraphicParameters,
    vendorParameters?: Record<string, unknown>
  ): Promise<ImageType> {
    const url = this.getLegendGraphicURL(wmsParameters, vendorParameters);
    const response = await this.fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._checkResponse(response, arrayBuffer);
    try {
      return await ImageLoader.parse(arrayBuffer, this.loadOptions);
    } catch {
      throw this._parseError(arrayBuffer);
    }
  }

  // Typed URL creators
  // For applications that want full control of fetching and parsing

  /** Generate a URL for the GetCapabilities request */
  getCapabilitiesURL(
    wmsParameters?: WMSGetCapabilitiesParameters,
    vendorParameters?: Record<string, unknown>
  ): string {
    const options: Required<WMSGetCapabilitiesParameters> = {
      version: this.wmsParameters.version,
      ...wmsParameters
    };
    return this._getWMSUrl('GetCapabilities', options, vendorParameters);
  }

  /** Generate a URL for the GetMap request */
  getMapURL(
    wmsParameters: WMSGetMapParameters,
    vendorParameters?: Record<string, unknown>
  ): string {
    const options: Required<WMSGetMapParameters> = {
      version: this.wmsParameters.version,
      // layers: [],
      // bbox: [-77.87304, 40.78975, -77.85828, 40.80228],
      // width: 1200,
      // height: 900,
      styles: this.wmsParameters.styles,
      crs: this.wmsParameters.crs,
      format: this.wmsParameters.format,
      transparent: this.wmsParameters.transparent,
      ...wmsParameters
    };
    return this._getWMSUrl('GetMap', options, vendorParameters);
  }

  /** Generate a URL for the GetFeatureInfo request */
  getFeatureInfoURL(
    wmsParameters: WMSGetFeatureInfoParameters,
    vendorParameters?: Record<string, unknown>
  ): string {
    const options: Required<WMSGetFeatureInfoParameters> = {
      version: this.wmsParameters.version,
      // layers: this.props.layers,
      // bbox: [-77.87304, 40.78975, -77.85828, 40.80228],
      // width: 1200,
      // height: 900,
      // x: undefined!,
      // y: undefined!,
      // query_layers: [],
      srs: this.wmsParameters.crs,
      format: this.wmsParameters.format,
      info_format: this.wmsParameters.info_format,
      styles: this.wmsParameters.styles,
      ...wmsParameters
    };
    return this._getWMSUrl('GetFeatureInfo', options, vendorParameters);
  }

  /** Generate a URL for the GetFeatureInfo request */
  describeLayerURL(
    wmsParameters: WMSDescribeLayerParameters,
    vendorParameters?: Record<string, unknown>
  ): string {
    const options: Required<WMSDescribeLayerParameters> = {
      version: this.wmsParameters.version,
      ...wmsParameters
    };
    return this._getWMSUrl('DescribeLayer', options, vendorParameters);
  }

  getLegendGraphicURL(
    wmsParameters: WMSGetLegendGraphicParameters,
    vendorParameters?: Record<string, unknown>
  ): string {
    const options: Required<WMSGetLegendGraphicParameters> = {
      version: this.wmsParameters.version,
      // format?
      ...wmsParameters
    };
    return this._getWMSUrl('GetLegendGraphic', options, vendorParameters);
  }

  // INTERNAL METHODS

  _parseWMSUrl(url: string): {url: string; parameters: Record<string, unknown>} {
    const [baseUrl, search] = url.split('?');
    const searchParams = search.split('&');

    const parameters: Record<string, unknown> = {};
    for (const parameter of searchParams) {
      const [key, value] = parameter.split('=');
      parameters[key] = value;
    }

    return {url: baseUrl, parameters};
  }

  /**
   * Generate a URL with parameters
   * @note case _getWMSUrl may need to be overridden to handle certain backends?
   * @note at the moment, only URLs with parameters are supported (no XML payloads)
   * */
  protected _getWMSUrl(
    request: string,
    wmsParameters: WMSCommonParameters & {[key: string]: unknown},
    vendorParameters?: Record<string, unknown>
  ): string {
    let url = this.url;
    let first = true;

    // Add any vendor searchParams
    const allParameters = {
      service: 'WMS',
      version: wmsParameters.version,
      request,
      ...wmsParameters,
      ...this.vendorParameters,
      ...vendorParameters
    };

    // Encode the keys
    for (const [key, value] of Object.entries(allParameters)) {
      // hack to preserve test cases. Not super clear if keys should be included when values are undefined
      if (key !== 'transparent' || value) {
        url += first ? '?' : '&';
        first = false;
        url += this._getParameterValue(wmsParameters.version!, key, value);
      }
    }

    return encodeURI(url);
  }

  _getParameterValue(version: string, key: string, value: unknown): string {
    // SRS parameter changed to CRS in 1.3.0, in non-backwards compatible way (sigh...)
    if (key === 'crs' && version !== '1.3.0') {
      key = 'srs';
    }

    key = key.toUpperCase();

    // TODO - in v1.3.0 only, the order of parameters for BBOX depends on whether the CRS definition has flipped axes
    // You will see this in the GetCapabilities request at 1.3.0 - the response should show the flipped axes.
    // BBOX=xmin,ymin,xmax,ymax NON-FLIPPED
    // BBOX=ymin,xmin,ymax,xmax FLIPPED
    // / EPSG:4326 needs to have flipped axes. 4326 1 WGS 84 Latitude North Longitude East
    // In WMS 1.1.1 EPSG:4326 is wrongly defined as having long/lat coordinate axes. In WMS 1.3.0 the correct axes lat/long are used. CRS:84 is defined by OGC as having the same datum as EPSG:4326 (that is the World Geodetic System 1984 datum ~ EPSG::6326) but axis order of long/lat.
    // CRS:84 was introduced with the publication of the WMS 1.3.0 specification, to overcome this issue.

    return Array.isArray(value)
      ? `${key}=${value.join(',')}`
      : `${key}=${value ? String(value) : ''}`;
  }

  protected async _fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    const response = await this.fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._checkResponse(response, arrayBuffer);
    return arrayBuffer;
  }

  /** Checks for and parses a WMS XML formatted ServiceError and throws an exception */
  protected _checkResponse(response: Response, arrayBuffer: ArrayBuffer): void {
    const contentType = response.headers['content-type'];
    if (!response.ok || WMSErrorLoader.mimeTypes.includes(contentType)) {
      // We want error responses to throw exceptions, the WMSErrorLoader can do this
      const loadOptions = mergeLoaderOptions<WMSLoaderOptions>(this.loadOptions, {
        wms: {throwOnError: true}
      });
      const error = WMSErrorLoader.parseSync(arrayBuffer, loadOptions);
      throw new Error(error);
    }
  }

  /** Error situation detected */
  protected _parseError(arrayBuffer: ArrayBuffer): Error {
    const error = WMSErrorLoader.parseSync(arrayBuffer, this.loadOptions);
    return new Error(error);
  }
}
